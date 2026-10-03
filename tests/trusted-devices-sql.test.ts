import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';

let db: PGlite;
const a = '00000000-0000-4000-8000-000000000001';
const b = '00000000-0000-4000-8000-000000000002';
const devices = [10, 11, 12].map((n) => `00000000-0000-4000-8000-0000000000${n}`);
type Verdict = { user_id: string; status: string; reason: string | null; valid_until: string | null };
beforeAll(async () => {
  db = await PGlite.create();
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create table auth.users (id uuid primary key, email_confirmed_at timestamptz);
    create function auth.uid() returns uuid language sql as
      $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema public, auth to anon, authenticated, service_role;`);
  for (const name of ['202610030002_entitlement_trial', '202610030003_trusted_devices']) {
    await db.exec(readFileSync(`supabase/migrations/${name}.sql`, 'utf8'));
  }
}, 30_000);
afterAll(async () => { await db?.close(); });
beforeEach(async () => {
  await db.exec('reset role; truncate public.trusted_devices, public.device_trial_history, public.entitlements, auth.users;');
  await db.query('insert into auth.users values ($1, now()), ($2, now())', [a, b]);
});
async function check(user = a, device: string | null = devices[0]!) {
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [user]);
  await db.exec('set role authenticated');
  try { return (await db.query<{ result: Verdict }>('select public.get_entitlement($1::uuid) as result', [device])).rows[0]!.result; }
  finally { await db.exec('reset role'); }
}
it('registers first and second device; third is rejected without evicting or renewing trial', async () => {
  const first = await check();
  expect(first.status).toBe('trial');
  expect((await check(a, devices[1])).valid_until).toBe(first.valid_until);
  expect(await check(a, devices[2])).toMatchObject({ status: 'expired', reason: 'device_limit_reached' });
  expect((await db.query('select * from public.trusted_devices')).rows).toHaveLength(2);
  expect((await db.query('select * from public.device_trial_history')).rows).toHaveLength(2);
  await db.exec("update public.trusted_devices set last_seen_at = now() - interval '1 day'");
  expect((await check()).valid_until).toBe(first.valid_until);
  const row = (await db.query<{ fresh: boolean }>("select last_seen_at > now() - interval '1 minute' as fresh from public.trusted_devices where device_id = $1", [devices[0]])).rows[0]!;
  expect(row.fresh).toBe(true);
});
it('another account cannot get a new trial on the same device; original grant is unchanged', async () => {
  const first = await check();
  expect(await check(b)).toMatchObject({ status: 'expired', reason: 'trial_already_used_on_device' });
  expect((await db.query('select trial_started_at from public.entitlements where user_id = $1', [b])).rows[0]).toEqual({ trial_started_at: null });
  expect((await check()).valid_until).toBe(first.valid_until);
  expect((await db.query('select first_trial_user_id from public.device_trial_history')).rows).toEqual([{ first_trial_user_id: a }]);
});
it('same account and device can repeat login; expired trial never restarts', async () => {
  const first = await check(); expect((await check()).valid_until).toBe(first.valid_until);
  await db.exec("update public.entitlements set trial_started_at = now() - interval '15 days', trial_ends_at = now() - interval '1 day'");
  expect(await check()).toMatchObject({ status: 'expired', reason: null });
});
it('admin override bypasses trial restriction without creating trial or changing the previous owner', async () => {
  await check(); await check(b);
  await db.query("update public.entitlements set admin_override_until = now() + interval '30 days' where user_id = $1", [b]);
  expect(await check(b)).toMatchObject({ status: 'active', reason: null });
  expect((await db.query('select trial_started_at from public.entitlements where user_id = $1', [b])).rows[0]).toEqual({ trial_started_at: null });
  await db.query('update public.entitlements set blocked = true where user_id = $1', [b]);
  expect((await check(b)).status).toBe('blocked');
});
it('admin override bypasses device limit but never registers a third device; blocked still wins', async () => {
  await check(); await check(a, devices[1]);
  await db.exec("update public.entitlements set admin_override_until = now() + interval '1 day'");
  const bypass = await check(a, devices[2]);
  expect(bypass).toMatchObject({ status: 'active', reason: null });
  const deadline = (await db.query<{ admin_override_until: Date }>('select admin_override_until from public.entitlements')).rows[0]!.admin_override_until;
  expect(Date.parse(bypass.valid_until!)).toBe(deadline.getTime());
  expect((await db.query('select * from public.trusted_devices')).rows).toHaveLength(2);
  await db.exec("update public.entitlements set admin_override_until = now() - interval '1 second'");
  expect((await check(a, devices[2])).reason).toBe('device_limit_reached');
  await db.exec('update public.entitlements set blocked = true');
  expect((await check(a, devices[2])).status).toBe('blocked');
});
it('deleted accounts leave history; revoked devices are not automatically reactivated', async () => {
  await check();
  await db.query('delete from auth.users where id = $1', [a]);
  expect((await check(b)).reason).toBe('trial_already_used_on_device');
  await db.exec('update public.trusted_devices set revoked_at = now()');
  expect((await check(b)).reason).toBe('device_limit_reached');
});
it('requires confirmed identity and a non-null, non-zero UUID', async () => {
  await db.query('update auth.users set email_confirmed_at = null where id = $1', [b]);
  for (const user of ['', b]) await expect(check(user)).rejects.toThrow('Confirmed email required');
  for (const device of [null, '00000000-0000-0000-0000-000000000000']) await expect(check(a, device)).rejects.toThrow('Device identity required');
  await expect(check(a, 'bad')).rejects.toThrow('uuid');
  expect((await db.query('select * from public.trusted_devices')).rows).toHaveLength(0);
});
it('browser roles cannot manage own/foreign devices, trial history or bypass the RPC', async () => {
  await check();
  for (const role of ['anon', 'authenticated']) {
    await db.exec(`set role ${role}`);
    try {
      for (const table of ['trusted_devices', 'device_trial_history']) {
        for (const sql of [`select * from public.${table}`, `delete from public.${table}`,
          `update public.${table} set device_id = '${devices[2]}'`,
          table === 'trusted_devices' ? `insert into public.${table} (user_id, device_id) values ('${b}', '${devices[2]}')`
            : `insert into public.${table} values ('${devices[2]}', '${b}', now())`]) {
          await expect(db.exec(sql)).rejects.toThrow('permission denied');
        }
      }
      await expect(db.exec('select public.get_entitlement()')).rejects.toThrow('does not exist');
      await expect(db.exec(`select public.get_entitlement('${devices[0]}', '${b}')`)).rejects.toThrow('does not exist');
      if (role === 'anon') await expect(db.exec(`select public.get_entitlement('${devices[0]}')`)).rejects.toThrow('permission denied');
    } finally { await db.exec('reset role'); }
  }
  const rls = await db.query<{ relrowsecurity: boolean }>("select relrowsecurity from pg_class where oid in ('public.trusted_devices'::regclass, 'public.device_trial_history'::regclass)");
  expect(rls.rows.map((row) => row.relrowsecurity)).toEqual([true, true]);
});
