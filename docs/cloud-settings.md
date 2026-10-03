# Cloud Settings

CalculatorSettings and DocumentSettings are the only application data sent to
Supabase. Calculations, measurements, clients and PDF files stay in IndexedDB or
browser memory. Existing Calculation configuration snapshots are never rewritten.

## Apply schema before using this feature

In the **existing project** Supabase dashboard, open **SQL Editor → New query**.
Paste the complete contents of
`supabase/migrations/202610030001_cloud_settings.sql` and run once. The migration
is transactional and creates both tables, revision triggers, column privileges
and RLS policies. Do not replace existing tables or disable RLS. Alternatively,
apply this checked-in migration using your project's normal Supabase CLI workflow.
No service-role or database credentials belong in frontend environment variables.

Each table has one row per `auth.users` identity: `user_id` primary key, `payload`
JSONB, server-managed integer `revision` and `updated_at`. Authenticated users can
select/insert/update only their own row through `auth.uid()` policies. Anonymous
access, delete, owner changes and client-written revisions are not granted.
See [Supabase RLS documentation](https://supabase.com/docs/guides/database/postgres/row-level-security).

## Synchronization

After local ownership preparation, each settings repository loads independently:
an existing cloud row replaces the user-specific local cache; a missing cloud row
is inserted from user-owned local settings or existing defaults. Insert uniqueness
conflicts reload the winning cloud row instead of upserting. Anonymous ownership
migration and database schema version 4 remain unchanged.

Document defaults are exactly `{sellerName: '', sellerPhone: ''}`. This initial
unconfigured state is allowed in cloud/cache; explicit user saves still require
valid seller contacts. All other incomplete or corrupt records are rejected.

Save uses the revision loaded into the current session/editor. One conditional
UPDATE filters by owner and revision; the database trigger advances the revision.
Zero updated rows produce `settings_changed_elsewhere`. The editor retains its
draft and offers **Загрузить актуальные настройки**, which discards it explicitly.
Only successful cloud writes update the cache. There is no automatic overwrite,
merge, offline queue or background upload. Cache failure after cloud success is
reported as failure; reload reconciles with the committed cloud state.

When cloud/network is unavailable the calculator uses local cache. Settings show
a cache notice and can be opened; Save fails offline, or without an authoritative
loaded revision. Reconnect and load current settings before saving. First access
without a cache can use existing defaults for calculation while cloud is unavailable.

## Live verification status (2026-10-03)

A read-only REST probe against the configured project returned `404 / PGRST205`
for both tables: migration is not applied. No remote settings were changed.
The requested browser flow is blocked until schema is installed and an authenticated
test session is available. After migration, run one flow: login, change and save
calculator settings, reload and verify; change and save document settings, reload
and verify. Confirm cloud reads by loading in a fresh browser cache for the same
account (do not delete existing local Calculations).
