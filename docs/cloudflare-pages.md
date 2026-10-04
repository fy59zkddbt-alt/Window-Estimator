# Cloudflare Pages deployment foundation

Static Vite SPA; Supabase continues to own Auth, RPCs and Edge Functions. No
Cloudflare Functions, account resources, custom domain or live payments are added.
The branch starts at main `13e67d8`; the existing checkout commit `96e643f` was
cherry-picked with explicit user approval. Merge this branch before production
deployment; unchanged main does not yet contain this deployment foundation.

## Build settings

| Setting | Value |
| --- | --- |
| Package manager | `pnpm@11.19.0` (package.json), committed pnpm-lock.yaml |
| Framework preset | None (explicit Vite settings below) |
| Root directory | Repository root |
| Build command | `pnpm install --frozen-lockfile && pnpm run build` |
| Output directory | `dist` |
| Node | `24.19.0`, pinned in `.node-version` |
| Production branch | `main` |
| Preview branches | All non-production branches / PRs |

Set build variables in **both Production and Preview**: `PNPM_VERSION=11.19.0`
and `SKIP_DEPENDENCY_INSTALL=1` (the build command performs the frozen install).
Optionally set `NODE_VERSION=24.19.0` to match the checked-in pin. Do not rely
on the build image inferring Node/pnpm from `engines` or lockfile version.
See [Cloudflare build image](https://developers.cloudflare.com/pages/configuration/build-image/).

## Public frontend environment

- `VITE_SUPABASE_URL`: your Supabase HTTPS project URL.
- `VITE_SUPABASE_PUBLISHABLE_KEY`: browser `sb_publishable_...` key only.
- `VITE_APP_ORIGIN`: optional public HTTPS origin without path/query/credentials.
  **Leave blank in Production and Preview** to use `window.location.origin`.
  This automatically supports pages.dev, branch previews, localhost and later
  app.zamerok.ru. A fixed production value in Preview would send confirmations
  away from the preview. Change variables by rebuilding, not by editing dist.

Copy `.env.example` to `.env.local` for local development, then `pnpm run dev`.
Never enter service-role/secret keys, database passwords, Robokassa passwords or
any other server credentials in Pages build variables or any `VITE_*` value.
Vite browser values are public. There is no frontend ResultURL/server secret.
The repository's gitignored `.env.local` is not uploaded via Git integration;
publish only `dist`, never the repository root. Supabase missing configuration
blocks access rather than enabling an anonymous bypass.

## Manual Cloudflare steps

1. In Cloudflare, open **Workers & Pages → Create application → Pages → Connect
   to Git** (not a Workers deployment). Authorize the GitHub integration for
   `fy59zkddbt-alt/Window-Estimator`; credentials stay in the provider UI.
2. Select the repository and production branch `main`. Enter the settings above
   and the public variables separately for Production and Preview. Use the v3
   build system. Save and deploy after the feature has been merged into main.
3. Under project Settings → Builds & deployments, keep automatic production
   deployments enabled and Preview branch control set to all non-production
   branches. Push this feature branch when you want a preview before merging.
4. Record the assigned `https://<project>.pages.dev` and preview URL from the
   deployment. A final domain is unnecessary. Do not add a custom domain now.
5. Apply the Supabase URL settings below manually, then run the remote smoke
   checks. No dashboard changes or actual deployment were made by this task.

## Supabase Auth URLs (manual)

In Supabase → Authentication → URL Configuration, replace `<project>` with the
actual **Pages project hostname**, not a Supabase project ref:

| Field | Exact value/pattern |
| --- | --- |
| Site URL | `https://<project>.pages.dev` |
| Redirect URL, production | `https://<project>.pages.dev/auth/callback` |
| Redirect URL, project previews | `https://*.<project>.pages.dev/auth/callback` |
| Redirect URL, local dev | `http://localhost:5173/auth/callback` |
| Redirect URL, local IP (if used) | `http://127.0.0.1:5173/auth/callback` |

The preview wildcard is restricted to this Pages project. For tighter control,
replace it with exact trusted preview/branch callback URLs; avoid shared production
Supabase credentials on untrusted PR builds. Cloudflare Access-protected previews
require an authorized browser to open email callbacks. Site URL remains production.
If existing emails use the Site URL fallback, root `/` still loads the AuthGate.
Custom confirmation templates must use `{{ .ConfirmationURL }}` (or preserve the
requested RedirectTo); a template hardcoding SiteURL defeats preview redirects.
See [Supabase redirect configuration](https://supabase.com/docs/guides/auth/redirect-urls).

Registration now sends `options.emailRedirectTo` for the resolved app origin.
`/auth/callback` serves the same SPA; the existing SDK's `detectSessionInUrl: true`
and `getSession()` restore the confirmation session before ownership/access gates.
No second auth client or manual token storage is introduced. This is the existing
email/password flow, not a new OAuth or password-reset feature. No genuine email
confirmation was attempted against a live Supabase project during preparation.

## Routes, returns and CORS

Pages native SPA fallback (no top-level `404.html`) supports direct navigation/
reload at `/auth/callback` and nested paths while Vite emits root-relative
`/assets/...` references. No `_redirects` or `_headers` is necessary. The current
Pages emulator rejects an explicit `/* /index.html 200` as an infinite loop, so
this project deliberately relies on native fallback. Calculator screens use React
state, not URL routes: `/settings` can load the shell but does not select a settings
screen. There is no new product router. Do not add a top-level `404.html` or a
conflicting Pages Function without reconsidering the SPA fallback.
See [Pages routing](https://developers.cloudflare.com/pages/configuration/serving-pages/)
and [rewrites](https://developers.cloudflare.com/pages/configuration/redirects/).

Robokassa dashboard return addresses, **GET**, are already implemented:

- SuccessURL: `https://<project>.pages.dev/?checkout=success`
- FailURL: `https://<project>.pages.dev/?checkout=fail`
- Future ResultURL, **POST**:
  `https://<supabase-project-ref>.supabase.co/functions/v1/robokassa-result`

ResultURL remains the existing 503 stub: it cannot confirm or activate payment.
Neither return URL proves payment. Do not point ResultURL at Pages or enable live
checkout. This task does not deploy Edge Functions, apply migrations or edit
merchant configuration. Existing prerequisites are in [checkout](robokassa-checkout.md).

`CHECKOUT_APP_ORIGIN` belongs only to Supabase Edge Function server configuration:
use exact `https://<project>.pages.dev` without path. Checkout currently allows
one origin; previews can use Auth/RPCs but will receive 403 for checkout against
that production endpoint. Test preview checkout with a separate staging Supabase
project/function set to its exact preview origin. Do not widen CORS to wildcard
pages.dev or change production origin for each PR. Standard Supabase Auth/RPC
calls use SDK endpoints, not a Pages API; Auth Redirect URLs are not a CORS list.
No Pages Access-Control-Allow-Origin header is necessary for this same-origin SPA.

## PDF and later origin changes

HTTPS pages.dev satisfies secure-context requirements for Web Share. Sharing
still depends on browser support, `canShare({ files })` and a user click. Existing
download uses a same-context blob URL and does not embed an app host; it remains
the fallback. No restrictive Permissions-Policy header is added.

Later add app.zamerok.ru via Pages Custom domains, configure DNS/TLS, then manually
set Supabase Site URL to `https://app.zamerok.ru` and add
`https://app.zamerok.ru/auth/callback`. Update server `CHECKOUT_APP_ORIGIN` and
merchant Success/Fail to that origin; ResultURL stays on Supabase. Runtime origin
requires no frontend architecture change. Keep old callback URLs while old emails
remain relevant. Plan local-data export/import **before** redirecting pages.dev:
localStorage/IndexedDB, device identity and sessions are isolated per origin;
calculations do not automatically move to the new host. A new host may count as
a new trusted context. Cloud settings sync after login; local calculations do not.

## Smoke checks

Local Pages emulation: `pnpm dlx wrangler@4 pages dev dist --port 8788` after build.
This needs no Cloudflare login. Check root, `/auth/callback`, `/nested/route`, both
return queries and JS/CSS assets; HTML should be 200, assets their correct types.
Also run `pnpm run dev` and verify local callback/direct navigation.

On the assigned HTTPS production and a trusted preview, repeat reload checks,
register a test user, open the real confirmation email and verify it returns to
that same origin, restores session and reaches ownership/access gates. Test login,
logout, PDF download and supported mobile file sharing. Verify foreign-origin
checkout is rejected and Success/Fail cannot activate access. The real hosted
email/share checks remain manual until an account/project deployment exists.

## Preparation validation (2026-10-04)

- Initial main production build passed. Final build passed after removing the
  rejected rewrite; the existing >500 kB chunk warning remains.
- Targeted auth/origin/checkout/architecture: 7 files, 44 tests passed.
- One full `pnpm test`: 37 files, 416 tests passed. `pnpm run typecheck` passed.
- `pnpm install --frozen-lockfile` passed without lockfile changes. Local tooling
  was Node 24.19.0 / pnpm 11.25.0; Pages is explicitly pinned to package.json's
  pnpm 11.19.0. The hosted build image was not executed.
- Wrangler 4.147.0 Pages emulator and Vite dev returned HTML 200 for root,
  callback, nested path and both checkout return queries. Production JS/CSS
  returned their proper MIME types, not fallback HTML.
- Browser loaded the production callback and nested path, then reloaded both
  successfully to the login gate; dev callback also mounted the login gate.
  Return UI behavior was checked by component tests, without live payment/auth.
- All five production JS assets were scanned for server credential/adapter
  markers (`ROBOKASSA_PASSWORD_*`, service role, secret key prefix, server RPC,
  checkout origin and crypto adapter). None were found; the browser import graph
  check passed. No real credentials were committed.
