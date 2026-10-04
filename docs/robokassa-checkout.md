# Robokassa Checkout Foundation

Branch: `feature/robokassa-checkout`, based on Subscription Foundation main
`13e67d8e33dee566a6220ce47c733f690baf3fc6`. Trial remains 14 days without card.
One provisional plan: 1290 RUB/month. No actual subscription activation or renewal.

## Authority and flow

Billing UI calls the no-argument `SubscriptionCheckout.createSubscriptionCheckout()`
port. Supabase browser adapter sends POST `{}` to `subscription-checkout`, then
validates the returned HTTPS Robokassa host/path before browser navigation.
The Edge Function independently verifies the bearer token with `auth.getUser`
and requires confirmed email; JWT verification is explicit (gateway `verify_jwt=false`
supports asymmetric Supabase keys). CORS permits only `CHECKOUT_APP_ORIGIN`.
Request fields are rejected, including amount and user ID. Browser has no service key.

Server application service uses the existing provider-neutral `PaymentProvider`
boundary, extended with a provider-neutral payment reference. RPC
`prepare_subscription_checkout(user UUID)` is callable ONLY by service_role/owner.
It locks the confirmed user's row, denies blocked users, live active subscriptions
(including cancel pending), and past_due subscriptions, and reuses or creates
a pending attempt. A past_due account needs the future recovery flow, not a new
subscription purchase. An elapsed active period may purchase again. No entitlement,
trial or subscription is written by checkout. Service cross-checks owner, plan,
provider, pending status, currency and amount before issuing the URL.

`payment_attempts` stores UUID, user FK, provider, plan, amount in minor units,
currency, neutral status, unique positive integer provider invoice ID and timestamps.
Amount is set in SQL to 129000, never from request. Application verifies against
the plan. A future price change must update the plan and server schema together.
RLS has no browser policies; anon/authenticated have no table or RPC grants.

## Idempotency

One pending attempt per user, enforced by a partial unique index and serialized
creation. Double clicks, parallel tabs, retry after errors and Fail return reuse
the same invoice ID and signed URL. Attempts intentionally do not expire here:
expiring a locally pending attempt would not invalidate an already issued provider
URL, and could allow duplicate first payments. Only future verified server events
may close attempts. Server adapter errors leave pending attempts reusable.
Credentials and merchant configuration must remain stable while pending URLs exist.
Neither return query nor browser can cancel/mark failed/mark paid an attempt.

## Adapter and official references (checked 2026-10-04)

- [Payment interface](https://docs.robokassa.ru/ru/pay-interface): GET/POST
  `https://auth.robokassa.ru/Merchant/Index.aspx`. Adapter sends MerchantLogin,
  OutSum `1290.00`, InvId, Description, Culture, SignatureValue, Shp_attempt.
  Merchant must select MD5. Signature input is
  `MerchantLogin:OutSum:InvId:Password1:Shp_attempt=UUID`, UTF-8 → MD5 hex.
  Shp parameters are signed and returned; UUID contains no customer identity.
- [Recurring payments](https://docs.robokassa.ru/ru/recurring-payments): first
  (parent) payment includes `Recurring=true`. Recurring must be enabled by Robokassa
  separately. Its invoice ID is retained for future `PreviousInvoiceID` after a
  VERIFIED successful bank-card parent payment. No card token is required for this
  documented invoice-based flow; no child recurring request exists in this feature.
- [Test mode](https://docs.robokassa.ru/ru/testing-mode): always `IsTest=1`, using
  separate TEST Password #1. Test operations do not debit funds. Production mode
  is rejected by the adapter until the next verified lifecycle feature.
- [Notifications/redirects](https://docs.robokassa.ru/ru/notifications-and-redirects):
  SuccessURL is not payment proof. Fixed SuccessURL/FailURL are configured in the
  merchant dashboard, both GET; they are not unsigned dynamic request parameters.
  SuccessUrl2/FailUrl2 overrides are not used, avoiding additional signature modifiers.
  ResultURL is the server confirmation boundary, not a browser redirect.

## Manual Supabase step — do not run automatically

First confirm migrations 001–004 are applied. In SQL Editor as owner, run the
ENTIRE `supabase/migrations/202610040005_robokassa_checkout.sql` once. It is
transactional. For CLI-managed history, use the pending migration workflow
instead; do not apply via both paths. No SQL or functions were deployed by this task.
Check RLS enabled and no anon/authenticated table/RPC privileges. Migration tests
execute actual SQL with PGlite and role switching; live Supabase remains unverified.

STOP live verification here until you have manually applied migration 005.
Then configure/deploy Edge Functions through your normal Supabase workflow:
`supabase functions deploy subscription-checkout` and
`supabase functions deploy robokassa-result` using the checked-in config.
The function source imports provider-neutral application files from the repository;
deploy from this repository root so they are included in the dependency graph.
Use `deno check --config supabase/functions/deno.json` on both entrypoints if Deno
is available. Server source is outside the Vite frontend graph.

## Merchant test preparation and secrets

Create/get a Robokassa merchant login; ask Robokassa to enable recurring payments
for that merchant and confirm test-mode availability for parent recurring payments.
In Technical Settings select MD5; create separate TEST Password #1 and #2.
Never send passwords in chat. Add values via Supabase Dashboard → Edge Functions →
Secrets (or a securely managed CLI secret file outside the repository):

- `ROBOKASSA_MERCHANT_LOGIN`
- `ROBOKASSA_PASSWORD_1` — TEST password #1 for this feature
- `ROBOKASSA_TEST_MODE` — must be `true`
- `CHECKOUT_APP_ORIGIN` — deployed frontend origin, HTTPS

Supabase supplies `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` to Edge Functions;
keep both in the server context, never copy service role into VITE variables.
`ROBOKASSA_PASSWORD_2` is needed for the NEXT webhook feature, not consumed now;
keep the test password available privately. No new frontend env variables.
No configurable provider base URL: the adapter pins the official endpoint.
No credential values, checkout URLs or request tokens are logged or stored in IndexedDB.

Configure dashboard URLs, replacing APP_ORIGIN and PROJECT_REF privately:

- SuccessURL GET: `APP_ORIGIN/?checkout=success`
- FailURL GET: `APP_ORIGIN/?checkout=fail`
- ResultURL POST: `https://PROJECT_REF.supabase.co/functions/v1/robokassa-result`

Result endpoint is an explicit 503 stub, never replies `OK{InvId}`, never writes.
Test notification completion will therefore remain pending; do not use production
checkout. Final ResultURL acknowledgment is intentionally deferred.
Fiscalization/receipt settings must be agreed with Robokassa before production;
this test-only foundation does not pretend to provide production fiscal receipts.

## Return and next feature

Success displays processing/checking, refreshes the authoritative entitlement
through the existing gate on load, and offers manual refresh. Fail displays
incomplete payment and offers return/retry. Fake query parameters can only change
that explanatory copy. Paid users never receive a new purchase button; offline
snapshots and missing billing cannot checkout. Cancel/resume remain unconnected.

Next feature owns ResultURL signature verification with Password #2, amount/user/
invoice matching, durable deduplication, transactionally marking attempts succeeded,
paid activation and period dates; then recurring renewal/failure, past_due,
cancel/resume provider lifecycle and out-of-order event protection. Do not derive
activation from this return UI. Real payment requires separate user authorization.

## Validation in this feature

Targeted checkout/application/adapter/UI/SQL/architecture checks passed. Final
`pnpm test` ran once: 36 files, 403 passing tests. `pnpm run typecheck` and
`pnpm run build` passed; build retains the existing >500 kB chunk warning.
Both Edge Function entrypoints passed Deno check (via temporary `pnpm dlx deno`,
without adding project dependencies). Frontend import graph test and production
bundle scan found no server credential markers, crypto adapter or service key.

Local browser fixture verified trial and expired purchase buttons, disabled
loading state, visible error with unchanged trial/billing, checkout redirect,
Success processing with unchanged trial/unsubscribed state, Fail with unchanged
expired state and retry, and hidden purchase for active paid state. This exercises
the actual BillingSummary/AccessGate/return components with a fixture checkout
port; it is not a live Robokassa/Supabase merchant test. No migrations were applied,
functions deployed, real payments made or paid states provisioned.
