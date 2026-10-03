# Trusted devices + basic trial reuse protection

Auth/local ownership is unchanged. AccessGate calls the single server RPC
`get_entitlement(p_device_id uuid)`. The previous no-argument RPC is removed;
old clients fail closed and cannot initialize trials without device checks.
No logic is added to Calculation, geometry, pricing, PDF or cloud calculations.

## Installation identity

`BrowserDeviceIdentity` generates a random `crypto.randomUUID()` once and stores
it in localStorage under `window-estimator:device:v1`. It contains no personal
data. Reload, login, account switching and logout retain it. Unavailable/corrupt
storage fails closed, without silently generating a replacement identity.
Safari/browser and standalone/PWA may have different storage contexts and hence
different IDs. This identifies an installation context, not physical hardware.
Clearing storage or deliberately supplying another UUID can evade this simple
protection; no fingerprint, IP blocking or hardware identifiers are used.

The entitlement cache now uses a v2 namespace scoped to both user and device.
Old cache permissions are not reused. The existing 24-hour/deadline-bounded
offline grace remains; authoritative restriction responses replace cached grants.
Offline cannot observe a new server restriction until reconnect.

## Server policy and permissions

- `trusted_devices`: server-generated ID, auth user FK, device UUID, creation and
  last-seen timestamps, optional revocation timestamp; unique user/device pair.
  The same context can appear under different accounts.
- At most two non-revoked contexts per account. Repeat access updates last_seen_at.
  The third returns `device_limit_reached`, without registering or evicting anything.
  Revoked devices cannot automatically re-register (management UI is outside scope).
- `device_trial_history`: device primary key, first trial user UUID and start time.
  History survives account deletion and never changes ownership. No user FK is
  intentional here. Existing/expired legacy trials are recorded on first device
  access using their original dates; migration cannot reconstruct unseen devices.
- When a user has no trial yet and the context has another trial owner, no trial
  dates are initialized: `trial_already_used_on_device`. Original entitlement is
  untouched. Same user/context never restarts trial. A user with an already
  initialized trial keeps that original grant, including on a shared context.
  A rejected account may qualify on a different, unused context; this feature
  tracks context reuse and does not impose an account-wide fraud ban.
- RPC derives ownership from `auth.uid()`, checks confirmed email and validates
  the UUID. Account row locks serialize device registrations; transaction advisory
  locks serialize first-trial checks across accounts for the same context.
- Both new tables have RLS enabled, no browser policies and no browser table or
  sequence privileges. Browser roles cannot read/write either their own or another
  user's devices/history. Only authenticated users can execute the RPC. The
  SECURITY DEFINER function uses an empty search_path and qualified objects.
  service_role has server-only select/insert/update privileges.
- `blocked` always wins. A live server admin_override_until bypasses either
  restriction without registering a third device or granting an abusive trial.
  Such bypass expires at the override deadline, even if another grant lasts longer.
  active_until alone does not bypass a device restriction. The existing SQL-only
  admin procedure in [entitlement-trial.md](entitlement-trial.md) is unchanged.

## Apply manually to real Supabase

This feature does **not** apply live SQL. Before deploying the new frontend:

1. Verify the existing entitlement migration `202610030002_entitlement_trial.sql`
   was already applied. Do not re-run it on an existing table.
2. Open the correct Supabase project → SQL Editor → New query.
3. Paste the **entire** `supabase/migrations/202610030003_trusted_devices.sql`
   file and click Run once as database owner. It is one transaction. Do not run
   individual fragments. Confirm successful completion before deploying frontend.
4. Confirm Email must remain enabled. No new env variables or secret/service-role
   keys are required in the frontend.
5. Log in with the current confirmed account in its normal context. SQL Editor:

   ```sql
   select user_id, device_id, created_at, last_seen_at, revoked_at
   from public.trusted_devices order by created_at;
   select device_id, first_trial_user_id, first_trial_started_at
   from public.device_trial_history order by first_trial_started_at;
   select user_id, trial_started_at, trial_ends_at, admin_override_until, blocked
   from public.entitlements;
   ```

6. Logout/login in the same context: same UUID/row and trial dates; last_seen_at
   advances. If convenient, use a separate browser/storage context for device 2.
   Device 3 should show the limit message and leave the first two rows intact.
   Only use disposable confirmed test accounts to check another account on the
   same context; its trial dates must remain null while the original grant remains.
   Do not clear normal browser storage or revoke real devices to run this smoke test.
7. Test an admin override only on a disposable account through SQL Editor using
   the existing documented procedure; blocked must still deny entry.

For CLI-managed migrations use the normal `supabase db push` process instead of
SQL Editor; do not apply the same file through both paths. Older frontend versions
must be updated after migration because the no-argument RPC is intentionally gone.
Live smoke tests are pending until the user applies the migration.

## Validation and scope

Targeted tests execute both migrations in PGlite with Supabase auth/roles fixtures,
and exercise the browser adapter, identity persistence/logout, cache scope and
restriction behavior. Browser fixture `/tests/browser/entitlement.html` exercises
AuthGate → AccessGate → App and both restriction messages without a live account.
This does not test physical Safari/PWA differences or production concurrency.

Local verification: targeted 34/34 tests; full `pnpm test` 369/369 tests in 30 files;
`pnpm run typecheck` and `pnpm run build` passed. Vite reports large bundle chunks.
Browser fixture verified login, both restriction screens and restored active access.
Live Supabase migration/smoke testing has not been performed.

No payments, recurring subscription, billing/account/device management UI,
fingerprinting, IP-based blocking or cloud Calculation storage were added.
