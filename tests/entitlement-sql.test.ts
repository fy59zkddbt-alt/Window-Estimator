import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';

let db: PGlite;
const a = '00000000-0000-4000-8000-000000000001';
const b = '00000000-0000-4000-8000-000000000002';
type Result = { user_id: string; status: string; server_now: string; valid_until: string };
beforeAll(async () => {
  db = await PGlite.create();
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth;
    create table auth.users (id uuid primary key, email_confirmed_at timestamptz);
    create function auth.uid() returns uuid language sql as
      $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema public, auth to anon, authenticated, service_role;
    grant execute on function auth.uid() to authenticated;
  `);
  await db.exec(readFileSync('supabase/migrations/202610030002_entitlement_trial.sql', 'utf8'));
}, 30_000);
afterAll(async () => { await db?.close(); });
beforeEach(async () => {
  await db.exec('reset role; truncate public.entitlements, auth.users;');
  await db.query('insert into auth.users values ($1, now()), ($2, null)', [a, b]);
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [a]);
});
async function check() {
  await db.exec('set role authenticated');
  try { return (await db.query<{ entitlement: Result }>('select public.get_entitlement() as entitlement')).rows[0]!.entitlement; }
  finally { await db.exec('reset role'); }
}
it('first confirmed authenticated access creates a 14-day trial once with server now', async () => {
  const first = await check();
  expect(first.status).toBe('trial'); expect(first.user_id).toBe(a);
  expect(Date.parse(first.valid_until) - Date.parse(first.server_now)).toBe(14 * 86_400_000);
  const second = await check(); expect(second.valid_until).toBe(first.valid_until);
  expect((await db.query('select * from public.entitlements')).rows).toHaveLength(1);
  const serverTime = (await db.query<{ now: Date }>('select now()')).rows[0]!.now;
  expect(Math.abs(Date.parse(first.server_now) - serverTime.getTime())).toBeLessThan(2000);
});
it('unconfirmed or missing identity cannot initialize a trial', async () => {
  for (const id of [b, '']) {
    await db.query("select set_config('request.jwt.claim.sub', $1, false)", [id]);
    await expect(check()).rejects.toThrow('Confirmed email required');
  }
  expect((await db.query('select * from public.entitlements')).rows).toHaveLength(0);
});
it('expired trial remains expired after a repeat login', async () => {
  await check();
  await db.exec("update public.entitlements set trial_started_at = now() - interval '15 days', trial_ends_at = now() - interval '1 day'");
  expect((await check()).status).toBe('expired'); expect((await check()).status).toBe('expired');
});
it('server admin override enables access until specified date; blocked takes priority', async () => {
  await check();
  await db.exec("update public.entitlements set trial_started_at = now() - interval '15 days', trial_ends_at = now() - interval '1 day', admin_override_until = now() + interval '2 days'");
  const override = await check(); expect(override.status).toBe('active');
  await db.exec('update public.entitlements set blocked = true');
  expect((await check()).status).toBe('blocked');
  await db.exec("update public.entitlements set blocked = false, admin_override_until = now() - interval '1 second'");
  expect((await check()).status).toBe('expired');
});
it('pre-provisioned beta rows get a trial once without losing override or blocked', async () => {
  await db.query("insert into public.entitlements (user_id, admin_override_until, blocked) values ($1, now() + interval '30 days', true)", [a]);
  expect((await check()).status).toBe('blocked');
  await db.exec('update public.entitlements set blocked = false');
  expect((await check()).status).toBe('active');
  const rows = await db.query<{ trial_started_at: Date; trial_ends_at: Date }>('select trial_started_at, trial_ends_at from public.entitlements');
  expect(rows.rows[0]!.trial_ends_at.getTime() - rows.rows[0]!.trial_started_at.getTime()).toBe(14 * 86_400_000);
});
it('browser roles cannot read/write entitlement or call RPC anonymously or supply dates/userId', async () => {
  await check();
  for (const role of ['anon', 'authenticated']) {
    await db.exec(`set role ${role}`);
    try {
      for (const sql of ['select * from public.entitlements', 'update public.entitlements set blocked = false',
        'delete from public.entitlements', `insert into public.entitlements (user_id) values ('${b}')`]) {
        await expect(db.exec(sql)).rejects.toThrow('permission denied');
      }
      if (role === 'anon') await expect(db.exec('select public.get_entitlement()')).rejects.toThrow('permission denied');
      await expect(db.exec(`select public.get_entitlement('${b}', now())`)).rejects.toThrow('does not exist');
    } finally { await db.exec('reset role'); }
  }
});
