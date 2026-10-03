# Auth foundation

Provider: Supabase Auth with the official browser SDK. Server data is limited to
email identity, provider-managed password credentials and auth sessions. No
Calculation upload or server backend are used. This foundation has since been
extended by [Cloud Settings](cloud-settings.md): only global calculator/document
settings are synchronized; calculation and client data remain local.

## Setup

1. Create a managed Supabase project and enable email/password authentication.
2. Copy `.env.example` to `.env.local`; supply the project URL and a modern
   `sb_publishable_...` browser key from the project dashboard.
3. Configure the application's deployed URL as the Auth Site URL and allowed
   redirect URL if email confirmation is enabled. Restart Vite after editing env.

Only publishable keys are accepted. Legacy anon JWT keys are deliberately not
accepted to make accidental service-role configuration fail closed. Never put
secret/service-role keys in any `VITE_*` variable: Vite embeds these in the bundle.
Missing configuration blocks entry with a setup message; there is no anonymous
fallback or development authentication bypass.

## Session and UI

Registration uses email/password only. If Supabase requires email confirmation,
the UI explains the next step; no separate verification screen is introduced.
Without confirmation, the adapter closes the registration session and asks for
an explicit login. Login prepares local ownership before entitlement checking
and mounting the app (see [Entitlement + trial](entitlement-trial.md)). A loading
state hides the app during session restore and ownership setup.
Provider auth events handle signout and session changes, including other tabs.
Token refresh events for the same authenticated user keep the app mounted.
Logout closes the session in the current container (`scope: local`) and unmounts
the app, discarding editor state. Failed restore/ownership can be retried or exited.

Supabase owns token persistence and automatic refresh. Passwords are passed only
to the SDK, cleared from the form upon submission and never written by the app.
Browser auth tokens use SDK-managed local storage; no custom token store exists.
Local ownership is application isolation, not encryption or a security boundary
against someone with access to browser developer tools or compromised same-origin
JavaScript. Future server authorization must validate identity server-side.

Web and standalone/PWA containers may have different session and IndexedDB
storage. Each container restores its own session or requires a separate login
with the same account. No shared-container assumption exists. The separate
[Trusted devices](trusted-devices.md) layer now limits accounts to two contexts.

## Local ownership and migration

IndexedDB schema **4** adds `ownedCalculations` and `ownedSettings`; Calculation
DTOs remain schemaVersion=3 and contain no auth fields. Repository instances are
scoped to an immutable userId at the composition root. Calculation storage keys
encode `[userId, calculationId]`; settings keys encode `[userId, settingName]`.
The active calculation selection, CalculatorSettings and DocumentSettings are
scoped too. No user-scoped read falls back to anonymous or another user's data.
Anonymous repository mode exists only for compatibility with historical adapters
and tests; production bootstrap always passes the authenticated userId.

Existing v1 -> v2 -> v3 migrations are retained, then schema 4 adds empty stores
without rewriting or deleting original records or `legacyCalculations` backups.
On the first successful login/session restore, one IndexedDB transaction copies
all anonymous calculations and the three known settings to that user and writes
`anonymousDataOwner` in the original settings store. Originals remain intact.
The login form tells the user about this first-login assignment. A later login
never claims these originals again, even for another account. Concurrent claims
are serialized by IndexedDB. Conflicts abort the complete transaction, preserve
both versions and block app access with an explicit error; they require manual
resolution rather than silent overwrite. Empty installations are claimed too.
The first account owns anonymous data in that container; account deletion,
reassignment and recovery UI are outside this phase.

Domain geometry/pricing, Measurement, Calculation, ProposalDocument and PDF
renderer are unchanged. Auth uses an application port and an infrastructure
adapter, wired only in main.tsx. This foundation is now extended by the separate
entitlement/trial access layer, Trusted Devices and Cloud Settings. Payments,
cloud Calculations, organizations/roles and password reset are not implemented.

References: [React setup](https://supabase.com/docs/guides/auth/quickstarts/react),
[password auth](https://supabase.com/docs/guides/auth/passwords),
[auth events](https://supabase.com/docs/reference/javascript/auth-onauthstatechange).
