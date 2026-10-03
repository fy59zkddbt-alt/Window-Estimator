import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';

let db: PGlite;
const user = '00000000-0000-4000-8000-000000000001';
const other = '00000000-0000-4000-8000-000000000002';
const device = '00000000-0000-4000-8000-000000000010';
type Verdict = { status: string; reason: string | null; valid_until: string | null;
  billing: { trialEndsAt: string | null; subscription: null | { status: string; cancelAtPeriodEnd: boolean; currentPeriodEnd: string; graceEndsAt: string | null } } };
beforeAll(async () => {
  db = await PGlite.create();
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create table auth.users (id uuid primary key, email_confirmed_at timestamptz);
    create function auth.uid() returns uuid language sql as
      $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema public, auth to anon, authenticated, service_role;`);
  for (const name of ['202610030002_entitlement_trial', '202610030003_trusted_devices', '202610030004_subscription_foundation'])
    await db.exec(readFileSync(`supabase/migrations/${name}.sql`, 'utf8'));
}, 30_000);
afterAll(async () => { await db?.close(); });
beforeEach(async () => {
  await db.exec('reset role; truncate public.subscriptions, public.trusted_devices, public.device_trial_history, public.entitlements, auth.users;');
  await db.query('insert into auth.users values ($1, now()), ($2, now())', [user, other]);
});
async function check(id = user, deviceId = device) {
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [id]);
  await db.exec('set role authenticated');
  try { return (await db.query<{ result: Verdict }>('select public.get_entitlement($1::uuid) as result', [deviceId])).rows[0]!.result; }
  finally { await db.exec('reset role'); }
}
async function paid(status = 'active') {
  await db.query(`insert into public.subscriptions (user_id, provider, status, current_period_start, current_period_end)
    values ($1, 'test', $2, now() - interval '1 day', now() + interval '29 days')`, [user, status]);
}
async function endTrial() {
  await check();
  await db.exec("update public.entitlements set trial_started_at = now() - interval '15 days', trial_ends_at = now() - interval '1 day'");
}
it('active paid grants access and coexists with unchanged trial dates', async () => {
  const trial = await check(); await paid();
  const result = await check();
  expect(result.status).toBe('active'); expect(result.billing.trialEndsAt).toBe(trial.billing.trialEndsAt);
  expect(result.valid_until).toBe(result.billing.subscription!.currentPeriodEnd);
});
it('trial works without paid; canceled/expired subscriptions fall back to a live trial', async () => {
  expect((await check()).status).toBe('trial'); await paid('canceled');
  expect((await check()).status).toBe('trial');
  await db.exec("update public.subscriptions set status = 'expired'"); expect((await check()).status).toBe('trial');
});
it('blocked wins over paid, grace, trial and override', async () => {
  await paid(); await check();
  await db.exec("update public.entitlements set blocked = true, admin_override_until = now() + interval '60 days'");
  expect((await check()).status).toBe('blocked');
  await db.exec("update public.subscriptions set status = 'past_due'"); expect((await check()).status).toBe('blocked');
});
it('admin override wins over expired paid/trial and device restrictions with its own deadline', async () => {
  await endTrial(); await paid('expired');
  await db.exec("update public.entitlements set admin_override_until = now() + interval '2 days'");
  const r = await check(); expect(r.status).toBe('active');
  const date = (await db.query<{ d: Date }>('select admin_override_until as d from public.entitlements')).rows[0]!.d;
  expect(Date.parse(r.valid_until!)).toBe(date.getTime());
});
it('past_due sets exactly 72-hour server grace and repeated failures cannot extend it', async () => {
  await endTrial(); await paid(); await db.exec("update public.subscriptions set status = 'past_due', grace_ends_at = now() + interval '100 days'");
  const row = (await db.query<{ duration: number }>('select extract(epoch from grace_ends_at - updated_at)::int as duration from public.subscriptions')).rows[0]!;
  expect(row.duration).toBe(72 * 3600);
  const r = await check(); expect(r.status).toBe('active'); expect(r.valid_until).toBe(r.billing.subscription!.graceEndsAt);
  await db.exec("update public.subscriptions set status = 'past_due', grace_ends_at = now() + interval '100 days'");
  expect((await check()).valid_until).toBe(r.valid_until);
});
it('after grace paid expires; successful payment clears grace', async () => {
  await endTrial(); await paid('past_due');
  // Owner-only clock fixture; normal writes cannot modify an existing grace deadline.
  await db.exec(`alter table public.subscriptions disable trigger subscription_dates;
    update public.subscriptions set grace_ends_at = now() - interval '1 second';
    alter table public.subscriptions enable trigger subscription_dates;`);
  const r = await check(); expect(r.status).toBe('expired'); expect(r.billing.subscription!.status).toBe('expired');
  await db.exec("update public.subscriptions set status = 'past_due'");
  const lateFailure = await check(); expect(lateFailure.status).toBe('expired');
  expect(lateFailure.billing.subscription!.graceEndsAt).toBe(r.billing.subscription!.graceEndsAt);
  await db.exec("update public.subscriptions set status = 'active'");
  expect((await check()).billing.subscription!.graceEndsAt).toBeNull(); expect((await check()).status).toBe('active');
});
it('cancel keeps paid access; resume clears flag without changing dates', async () => {
  await endTrial(); await paid();
  await db.exec(`set role service_role; select public.set_subscription_renewal('${user}', true); reset role;`);
  const canceled = await check(); expect(canceled.status).toBe('active'); expect(canceled.billing.subscription!.cancelAtPeriodEnd).toBe(true);
  await db.exec(`set role service_role; select public.set_subscription_renewal('${user}', false); reset role;`);
  const resumed = await check(); expect(resumed.status).toBe('active'); expect(resumed.billing.subscription!.cancelAtPeriodEnd).toBe(false);
  expect(resumed.valid_until).toBe(canceled.valid_until);
});
it('period end expires canceled subscription and rejects resume/new cancel', async () => {
  await endTrial(); await paid();
  await db.exec(`select public.set_subscription_renewal('${user}', true);
    update public.subscriptions set current_period_start = now() - interval '31 days', current_period_end = now() - interval '1 second';`);
  for (const flag of [false, true]) await expect(db.exec(`select public.set_subscription_renewal('${user}', ${flag})`)).rejects.toThrow('new purchase');
  const r = await check(); expect(r.status).toBe('expired'); expect(r.billing.subscription!.status).toBe('expired');
});
it('future paid period and reserved active_until cannot manufacture access', async () => {
  await endTrial(); await paid();
  await db.exec("update public.subscriptions set current_period_start = now() + interval '1 day'; update public.entitlements set active_until = now() + interval '100 days'");
  expect((await check()).status).toBe('expired');
});
it('paid bypasses trial reuse restriction but retains trusted-device limit', async () => {
  await check(other); await paid();
  expect((await check()).status).toBe('active');
  expect((await check()).billing.trialEndsAt).toBeNull();
  await check(user, '00000000-0000-4000-8000-000000000011');
  expect(await check(user, '00000000-0000-4000-8000-000000000012')).toMatchObject({ status: 'expired', reason: 'device_limit_reached' });
  await db.query("update public.entitlements set admin_override_until = now() + interval '1 day' where user_id = $1", [user]);
  expect((await check(user, '00000000-0000-4000-8000-000000000012')).status).toBe('active');
});
it('browser roles cannot read/mutate subscription rows or call renewal helper; own summary excludes provider ids', async () => {
  await paid(); expect(JSON.stringify(await check())).not.toContain('provider');
  expect((await check(other, '00000000-0000-4000-8000-000000000011')).billing.subscription).toBeNull();
  for (const role of ['anon', 'authenticated']) {
    await db.exec(`set role ${role}`);
    try {
      for (const sql of ['select * from public.subscriptions', "update public.subscriptions set status = 'active'", 'delete from public.subscriptions',
        `insert into public.subscriptions (user_id) values ('${other}')`, `select public.set_subscription_renewal('${user}', false)`])
        await expect(db.exec(sql)).rejects.toThrow('permission denied');
    } finally { await db.exec('reset role'); }
  }
  expect((await db.query<{ enabled: boolean }>("select relrowsecurity as enabled from pg_class where oid = 'public.subscriptions'::regclass")).rows[0]!.enabled).toBe(true);
});
it('invalid server rows reject dates, status, provider and duplicate user', async () => {
  await paid();
  for (const assignment of ["current_period_end = current_period_start", "current_period_end = 'infinity'", "provider = ''", "status = 'unknown'"])
    await expect(db.exec(`update public.subscriptions set ${assignment}`)).rejects.toThrow();
  await expect(paid()).rejects.toThrow('unique');
});
