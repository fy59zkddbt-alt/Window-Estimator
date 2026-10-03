# Subscription Foundation

One provisional plan: 1290 RUB/month, recurring. Trial remains 14 days without
a card. No payment provider, checkout, webhook endpoint, retries or real charges
are implemented. Calculations and PDF stay local and unchanged.

## Server model and authority

`public.subscriptions` has one row per user: `user_id`, `provider`, optional
`provider_customer_id`/`provider_subscription_id`, `status` (active, past_due,
expired, canceled), `current_period_start`/`current_period_end`,
`cancel_at_period_end`, optional `grace_ends_at`, `created_at`/`updated_at`.
Dates must be finite and end must follow start. Provider subscription ids are
unique within a provider. No card data is stored.

Only owner/server service_role can write. RLS is enabled with no browser policies;
anon/authenticated have no table privileges, including SELECT. The confirmed-user
`get_entitlement(device UUID)` RPC returns only that user's billing projection:
status, period dates, cancellation flag, grace and trial deadline. Provider ids
are excluded. Browser receives no service-role key or mutation port.

Entitlement uses server time, in priority order: blocked; live admin override;
active current paid period; past_due with live grace; live trial; expired.
Trusted-device limit/revocation continues to deny normal paid/trial grants;
admin override bypasses it until its own deadline. A trial reuse restriction
does not deny paid access or create a new trial/history owner. The old reserved
`entitlements.active_until` is no longer an access source: any beta grant must
use `admin_override_until`. No real provider used active_until in earlier features.
`valid_until` is the selected grant's deadline (not the maximum of all grants),
so offline cache cannot keep a higher-priority verdict past its deadline.

On entering past_due, a trigger sets grace to server now + exactly 72 hours.
Repeated failures, including late failures after expiry, preserve that deadline.
Successful payment sets active with server-verified new period dates and clears
grace. `get_entitlement` expires active periods and elapsed grace atomically on
read; no background scheduler is introduced. A still-live trial can independently
grant trial access after paid expiry. Canceled never gives a paid grant.

Cancellation is active + cancel_at_period_end=true, preserving period dates/access.
Server-only `set_subscription_renewal(user UUID, cancel boolean)` sets/clears the
flag for a current active period; resume after end is rejected and requires a
future purchase. There is no callable browser cancel/resume action. Future adapter
must obtain provider acceptance before updating this flag.

`application/access/payment-provider.ts` defines server-only checkout, cancel,
resume ports and verified provider-neutral events/handler. These are contracts,
not implementations or deployed endpoints. A future handler must verify provider
signatures, map ownership using stored provider ids, persist event deduplication,
reject stale/out-of-order events, and only then write paid state. None of those
security obligations are delegated to the browser.

The account area exposes read-only billing within AccessGate, including denied
access screens. It displays test pricing, trial/current period, cancellation and
payment failure/grace. Offline data is labelled as a previous server snapshot.
There are no simulated payment buttons.

## Apply in live Supabase — manual step

This feature has NOT applied live SQL.

1. Confirm migrations 001 (cloud settings), 002 (trial) and 003 (trusted devices)
   are already applied. Subscription SQL depends on 002 and 003.
2. Open Supabase Dashboard → SQL Editor → New query as project database owner.
3. Paste the ENTIRE `supabase/migrations/202610030004_subscription_foundation.sql`
   and click Run once. It wraps schema, triggers, grants and RPC replacement in
   one transaction. Do not separately run fragments or reapply older migrations.
4. Check RLS is enabled on subscriptions and browser roles have no policies or
   table grants. Log in with a confirmed test user: trial dates must stay unchanged
   and RPC billing.subscription should initially be null.
5. In a disposable test account only, provision paid state with the owner SQL below.
   Check active, cancellation, resume, past_due and blocked; existing device limits
   must still work. Do not use provider credentials or real payments.
6. Deploy the frontend after SQL succeeds. Old cached responses lacking billing
   remain readable and display unavailable billing details until refreshed.

For CLI-managed projects use the normal pending-migration workflow instead, to
record migration history. Do not apply the same file via both methods. No new
frontend env variables are required.

## Owner-only test setup (never browser SQL)

Replace the UUID with your disposable confirmed test account. `test` represents
a synthetic server grant, not proof of a payment. Only run these in SQL Editor
as owner; they do not contact any provider.

```sql
insert into public.subscriptions
  (user_id, provider, status, current_period_start, current_period_end)
values ('00000000-0000-4000-8000-000000000001', 'test', 'active',
  now(), now() + interval '1 month');

select public.set_subscription_renewal('00000000-0000-4000-8000-000000000001', true);
-- Resume while the same active period is current:
select public.set_subscription_renewal('00000000-0000-4000-8000-000000000001', false);

update public.subscriptions set status = 'past_due'
where user_id = '00000000-0000-4000-8000-000000000001';
-- Trigger sets 72-hour grace. Repeating this cannot extend it.
```

## Validation

Targeted tests: subscription-sql, billing, billing-ui, entitlement, supabase-entitlement,
trusted-devices-sql. PGlite executes actual migrations, RPC, triggers, grants and
browser-role rejection; auth schema/roles are fixtures. Browser fixture
`/tests/browser/entitlement.html` includes paid, cancel_pending and past_due
responses alongside trial/expired/blocked. Fixture login never contacts Supabase.

Feature verification: full `pnpm test` passed 385 tests; the subsequent billing UI
expiry/restriction regression passed separately (1 test). Final typecheck and
production build passed. Vite reports the existing large bundle warning.
Browser checks covered trial, paid, cancellation, past_due and expired access.

Live Supabase still requires the manual migration/smoke check above. Robokassa,
checkout, webhook processing, event persistence, retries, refunds, card management,
billing portal, receipts, device-management UI and cloud Calculations remain
outside this feature.
