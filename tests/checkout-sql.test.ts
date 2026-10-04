import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';

let db: PGlite;
const user = '00000000-0000-4000-8000-000000000001';
const other = '00000000-0000-4000-8000-000000000002';
beforeAll(async () => {
  db = await PGlite.create();
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create table auth.users (id uuid primary key, email_confirmed_at timestamptz);
    create function auth.uid() returns uuid language sql as
      $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema public, auth to anon, authenticated, service_role;`);
  for (const name of ['202610030002_entitlement_trial', '202610030003_trusted_devices',
    '202610030004_subscription_foundation', '202610040005_robokassa_checkout'])
    await db.exec(readFileSync(`supabase/migrations/${name}.sql`, 'utf8'));
}, 30_000);
afterAll(async () => { await db?.close(); });
beforeEach(async () => {
  await db.exec('reset role; truncate public.payment_attempts, public.subscriptions, public.trusted_devices, public.device_trial_history, public.entitlements, auth.users;');
  await db.query('insert into auth.users values ($1, now()), ($2, now())', [user, other]);
});
async function prepare(id = user) {
  await db.exec('set role service_role');
  try { return (await db.query<{ attempt: { userId: string; id: string; amountMinor: number; status: string; providerPaymentReference: string } }>(
    'select public.prepare_subscription_checkout($1) as attempt', [id])).rows[0]!.attempt; }
  finally { await db.exec('reset role'); }
}
it('server creates user-bound fixed-price attempt; repeat calls reuse pending invoice; users are independent', async () => {
  const first = await prepare(); expect(first.userId).toBe(user); expect(first.amountMinor).toBe(129000);
  expect(first.status).toBe('pending'); expect(await prepare()).toEqual(first);
  const second = await prepare(other); expect(second.id).not.toBe(first.id);
  expect(second.providerPaymentReference).not.toBe(first.providerPaymentReference);
  expect((await db.query('select * from public.payment_attempts')).rows).toHaveLength(2);
});
it('checkout does not activate subscription, alter entitlement or start trial', async () => {
  await prepare();
  expect((await db.query('select * from public.subscriptions')).rows).toEqual([]);
  expect((await db.query('select * from public.entitlements')).rows).toEqual([]);
});
it('active paid, cancel-pending, past_due and blocked users cannot checkout', async () => {
  await db.query(`insert into public.subscriptions(user_id, provider, status, current_period_start, current_period_end)
    values ($1, 'test', 'active', now() - interval '1 day', now() + interval '1 month')`, [user]);
  await expect(prepare()).rejects.toThrow('existing paid');
  await db.exec('update public.subscriptions set cancel_at_period_end = true');
  await expect(prepare()).rejects.toThrow('existing paid');
  await db.exec("update public.subscriptions set status = 'past_due'");
  await expect(prepare()).rejects.toThrow('existing paid');
  await db.exec('truncate public.subscriptions');
  await db.query('insert into public.entitlements(user_id, blocked) values ($1, true)', [user]);
  await expect(prepare()).rejects.toThrow('blocked');
  expect((await db.query('select * from public.payment_attempts')).rows).toEqual([]);
});
it('expired paid user can purchase but unconfirmed/nonexistent users cannot', async () => {
  await db.query(`insert into public.subscriptions(user_id, provider, status, current_period_start, current_period_end)
    values ($1, 'test', 'active', now() - interval '2 months', now() - interval '1 month')`, [user]);
  expect((await prepare()).status).toBe('pending');
  await db.query('update auth.users set email_confirmed_at = null where id = $1', [other]);
  await expect(prepare(other)).rejects.toThrow('confirmed');
  await expect(prepare('00000000-0000-4000-8000-000000000099')).rejects.toThrow('confirmed');
});
it('anon/authenticated cannot read/write attempts, mutate price/status or invoke server RPC for any user', async () => {
  await prepare();
  for (const role of ['anon', 'authenticated']) {
    await db.exec(`set role ${role}`);
    for (const sql of ['select * from public.payment_attempts', "update public.payment_attempts set status = 'succeeded'",
      'update public.payment_attempts set amount_minor = 1', "update public.payment_attempts set provider_invoice_id = DEFAULT",
      'delete from public.payment_attempts',
      `insert into public.payment_attempts(user_id, provider, plan_id, amount_minor, currency) values ('${user}', 'robokassa', 'monthly', 129000, 'RUB')`,
      `select public.prepare_subscription_checkout('${user}')`, `select public.prepare_subscription_checkout('${other}')`])
      await expect(db.exec(sql)).rejects.toThrow('permission denied');
    await db.exec('reset role');
  }
  expect((await prepare()).status).toBe('pending');
});
it('database enforces one pending attempt per user and tracks updated_at for future server events', async () => {
  const first = await prepare();
  await expect(db.query(`insert into public.payment_attempts(user_id, provider, plan_id, amount_minor, currency)
    values ($1, 'robokassa', 'monthly', 129000, 'RUB')`, [user])).rejects.toThrow('one_pending');
  await db.exec("update public.payment_attempts set status = 'failed'");
  const second = await prepare(); expect(second.id).not.toBe(first.id);
  const timestamps = (await db.query<{ ok: boolean }>('select bool_and(updated_at >= created_at) as ok from public.payment_attempts')).rows[0]!;
  expect(timestamps.ok).toBe(true);
});
