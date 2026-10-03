# Entitlement + 14-day trial

**Subscription extension:** [Subscription Foundation](subscription-foundation.md)
adds migration 004 after 003. Paid state comes from subscriptions; the reserved
active_until field described below is historical and no longer grants access.
Trial dates and trusted-device rules remain unchanged.

**Current extension:** [Trusted devices](trusted-devices.md) adds a mandatory UUID
to the RPC and checks device registration/history before automatic trial creation.
Apply migration 003 after 002. The no-argument RPC described below is historical;
it is removed by 003. Existing trial dates/admin grants remain unchanged.

Auth restores identity/local ownership first. AccessGate then calls the server RPC;
only trial/active mounts App and its repositories. Expired/blocked unmount the
working interface without clearing any Calculation, settings or IndexedDB table.
Restored permission mounts the same user-scoped repositories. Unsaved editors
are not persisted, as in logout. Domain, pricing, geometry and PDF are unchanged.

## Apply to live Supabase (manual step)

No live SQL was applied by this feature. Before deploying its frontend:

1. Open your project's Supabase Dashboard → SQL Editor → New query.
2. Paste the entire contents of
   `supabase/migrations/202610030002_entitlement_trial.sql` and Run once as the
   project database owner. The file wraps all changes in one transaction.
3. Enable **Confirm email** in Authentication → Providers → Email. The RPC also
   independently checks `auth.users.email_confirmed_at`; an unconfirmed identity
   cannot initialize a trial even if it has a JWT.
4. Log in with a confirmed test account. Verify one row in `public.entitlements`,
   trial length of exactly 336 hours, and unchanged trial dates after logout/login.
   Browser users can execute only `get_entitlement()` and cannot read/write the table.
5. Deploy the frontend after this SQL succeeds. Without the RPC the UI fails closed.

For CLI-managed projects, apply the pending migration through your normal
`supabase db push` workflow instead of SQL Editor, so migration history is recorded.
Do not use both methods for the same file. This migration does not require cloud
settings tables or touch any Calculation. No new frontend environment variables
or secret/service-role keys are needed.

## Server-only administration

Run in SQL Editor as database owner (replace the UUID and UTC deadline):

```sql
insert into public.entitlements (user_id, admin_override_until)
values ('00000000-0000-4000-8000-000000000001', '2026-11-01T00:00:00Z')
on conflict (user_id) do update
set admin_override_until = excluded.admin_override_until;

update public.entitlements set blocked = true
where user_id = '00000000-0000-4000-8000-000000000001';
-- To unblock: set blocked = false. To remove override: set admin_override_until = null.
```

Blocked always wins. Otherwise a live override/active_until yields active; a live
trial yields trial; everything else is expired. validUntil is the latest known
grant deadline. active_until is reserved for a later server subscription adapter;
no paid subscription provider/payment flow exists. Never delete entitlement rows
or change trial dates to extend access. Administrative access should change only
blocked/admin_override_until. service_role has select/insert/update privileges;
browser roles have none. Admin credentials must remain server-side.

The RPC has no parameters, derives identity from auth.uid(), requires confirmed
email, uses server now(), locks pre-provisioned rows and inserts with conflict
handling. First access initializes the trial once, including for pre-provisioned
beta rows; subsequent calls never renew it. The empty security-definer search_path
and explicit execute grants follow the
[Supabase function security guidance](https://supabase.com/docs/guides/database/functions).

## Offline and warnings

The localStorage cache contains only the server verdict and elapsed-time anchors,
keyed by userId. Offline/transport failures may use it for strictly less than
24 hours, bounded by validUntil. Repeated failed checks never reset the anchor.
SQL/auth/HTTP errors invalidate cached permission. Blocked/expired server verdicts
replace a previous grant. Checks run on entry, reconnect, foreground and once per
minute while online; deadline evaluation runs once per second. Thus a new server
block is observed at the next successful check; offline revocation cannot be known
until reconnect (at most the remaining grace).

If an offline cold start cannot refresh an expired Auth JWT, only an SDK
AuthRetryableFetchError permits a previously remembered identity to reach
AccessGate. This hint contains no token and grants nothing by itself. AccessGate
still requires that same user's unexpired cache/grace. Logout, missing session,
and non-retryable auth rejection clear the hint. Initial null auth events defer
to restore(); later signout events remove identity and unmount access.

Server timestamps determine dates. Across restarts, device wall-clock elapsed
time estimates cache age; within a session the larger of wall and monotonic elapsed
time is used. Detected rollback fails closed; request latency is counted
conservatively. As with all local browser storage, a user controlling the device
can edit cache/JavaScript. This is an offline usability gate, not a trusted-device
or anti-tampering system, and never authorizes server mutations.

Warnings appear at <=5 days (ceil remaining days), escalate at <=24 hours,
and can be dismissed only in component/session memory until the next UTC server
day. Logout/reload shows them again. Expiry replaces App. The CTA explains that
payment will be available later.

## Validation

`pnpm exec vitest run tests/entitlement.test.ts tests/entitlement-sql.test.ts tests/supabase-entitlement.test.ts`
executes access/cache policy, adapter and real migration/RPC/permissions in PGlite
(test-only embedded PostgreSQL; mocked Supabase auth schema/roles).
`pnpm dev` then `/tests/browser/entitlement.html` exercises actual AuthGate,
AccessGate and App with fixture server responses and a separate fixture IndexedDB.
This fixture is excluded from the production entrypoint/build and uses no live account.
Live deployment still requires the manual Supabase migration and smoke check above.
