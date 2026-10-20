# PayByPalm Admin

An independent admin application at `/home/dell/PayByPalm/admin`. It shares the
existing PayByPalm Supabase project, but has its own server, login cookie, build
and deployment. The customer wallet, palm matching and payment flow are unchanged.

## First run

Node 22 or 24 is required. The local `.env` has already been configured privately
for the verified account **olusanyasamson633@gmail.com**. Use that account's
existing password; no new password or default administrator was created.

1. In the existing project's **Supabase Dashboard → SQL Editor**, create a new
   query, paste all of [db/0020_admin_onboarding.sql](db/0020_admin_onboarding.sql),
   and select **Run**. This additive, rerunnable migration creates the two admin
   tables and atomic onboarding functions, and adds merchant contact/terminal
   lifecycle columns. It preserves existing merchants, terminals and payments.
2. Start the independent app:

   ```bash
   cd /home/dell/PayByPalm/admin
   npm install
   npm run preflight
   npm run dev
   ```

3. Open **http://127.0.0.1:5190**, then sign in with the configured account.

The dev command starts the Vite app on 5190 and its server on 8090. The browser
uses the `/api` proxy on the same origin; production serves the built frontend
and API from one server. Changing the local hostname requires updating
`APP_ORIGIN` to its exact origin. Sign-in and writes fail closed if the existing
`consume_api_budget` RPC is unavailable.

## Onboard a merchant and Pi

1. **Merchants → Add merchant**: enter the business name and optional contact
   details and save the merchant. In **Bank payouts**, select its bank, enter its
   account number and choose **Verify bank account**. Review the resolved name,
   set the PayByPalm percentage, confirm, then choose **Confirm and create payout
   account**. The server creates the subaccount in Paystack and saves its code.
   Live sales require the admin server and payment backend to use the same live
   Paystack business. Bank-name resolution does not approve Paystack payout KYC.
2. Open the merchant and select **Add terminal**. Choose a label for the counter.
   A terminal's merchant cannot be reassigned later, preserving payment ownership.
3. Either generate a new configuration or paste a SHA-256 hash from the existing
   Pi provisioning script. The frontend sends only a hash to the admin API.
4. Download **terminal.env** before leaving the completion screen. Its random
   device key stays in browser memory; it is never stored in browser storage or
   in plaintext on the server. After losing this download, replace the key.
5. Transfer it privately to the correct Pi. As the Pi desktop user:

   ```bash
   install -d -m 700 ~/.config/paybypalm
   install -m 600 ~/Downloads/terminal.env ~/.config/paybypalm/terminal.env
   bash ~/.local/share/paybypalm/pi/start-kiosk-session.sh
   ```

   This assumes the existing PayByPalm kiosk launcher is installed. The manual
   start command preserves the user's disabled desktop autostart setting.
   Stop testing with `systemctl --user stop paybypalm-kiosk.service`.

The app does not have a remote Pi agent: it prepares and registers configurations;
it cannot upload files, restart kiosks, configure GPIO or change camera settings
remotely. Last contact is an authenticated-request heartbeat, not a live ping.

## Update or disable a terminal

Open **Terminals → Configure**. Labels can be edited. **Replace device key**
invalidates the previous key and gives a replacement download. Stop any active
sale first and install the replacement on that same Pi. **Disable terminal**
requires confirmation, changes the stored hash to an unissued random value and
marks the record disabled. The existing PayByPalm backend already authenticates
by hash, so the old device credential immediately stops working without a backend
code change. Disable is not remote shutdown: stop the Pi kiosk separately.
Re-enable by generating and installing a new key. Payment history is retained.

## Administrator access and sessions

`ADMIN_USER_IDS` is a private server-side list of immutable, verified Supabase
account UUIDs. Customer metadata or frontend claims cannot grant admin rights.
To look up another existing verified account, run:

```bash
npm run admin:lookup -- account@example.com
```

Update the allowlist privately and restart the server. Lookup alone grants
nothing. The current account remains a normal wallet customer outside this app.
Access/refresh tokens are encrypted in an HTTP-only, SameSite=Strict cookie;
JavaScript cannot read them. Production requires HTTPS/Secure cookies. Sessions
last at most eight hours, are rechecked against Supabase and the server allowlist
on each request, and are checked against `admin_sessions` for immediate revocation.
Logout revokes that admin session; it does not sign the customer out everywhere.
Mutations require the configured Origin. Shared database-backed budgets limit
login and admin actions. Operator changes are written atomically to `admin_audit`.

Customer palm images and card authorization tokens are not needed by this app.
Automatic payout onboarding uses a server-only Paystack secret. Never upload `.env` or terminal.env to Git.

## Deploy at admin.paybypalm.app on Vercel

Use a **separate Vercel project** named `paybypalm-admin` for this directory.
The wallet stays in its existing project. This app serves Vite's `dist` files
through Vercel's CDN; `api/index.ts` runs the admin Express API as one Node
Function. `vercel.json` routes `/api/*` and `/health` to it and applies the
production security headers to static pages too. No second Render service is
required for this deployment.

### 1. Use the existing Vercel project and Git repository

This app is a normal directory in `Ayodeji63/PayByPalm`, alongside `wallet` and
`backend`. It has no nested Git repository or submodule. Commit and push from
`PayByPalm` so GitHub shows `admin/` directly.

Keep the existing Vercel project **paybypalm-admin** and custom domain
**admin.paybypalm.app**. Connect it to **Ayodeji63/PayByPalm**, use production branch
**main**, and set **Root Directory = admin**. Keep the wallet project's Root
Directory at `wallet`. Each project reads its own `vercel.json`.

A push to `origin/main` deploys the connected projects. To deploy the admin
manually, its local ignored project link must identify `paybypalm-admin`:

```bash
cd /home/dell/PayByPalm/admin
npx vercel link --yes --project paybypalm-admin
pnpm run deploy:vercel -- --dry-run
pnpm run deploy:vercel
```

The guarded command stages the required `admin/` layout before invoking Vercel.
It excludes private `.env` files, local dependencies, generated files and nested
Git metadata. It preserves other apps' Vercel links. Do not run bare
`vercel --prod` inside `admin/`: the remote project now expects a repository
containing `admin/`, rather than the old standalone directory.

Build settings: **Vite**, Node **24.x**, install `npm ci --include=dev`, build
`npm run build && npm run guard:secrets`, output **dist**. These are already
specified by `vercel.json`; the build checks TypeScript and checks the browser
bundle for configured private values. No persistent start command is needed.

### 2. Configure private environment variables

In the **new admin project's Settings → Environment Variables**, add the following
for **Production** before deploying. Copy secret values privately from this
project's local `.env`; do not copy them into the wallet project or use `VITE_`
prefixes. Use the existing Supabase project whose admin migration is applied.

| Variable | Value |
| --- | --- |
| `NODE_ENV` | `production` |
| `APP_ORIGIN` | `https://admin.paybypalm.app` (no trailing slash) |
| `TRUST_PROXY_HOPS` | `1` |
| `NODEJS_HELPERS` | `0` (Express owns request/body handling) |
| `SUPABASE_URL` | Existing project's URL |
| `SUPABASE_ANON_KEY` | Existing project's anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Existing project's private service-role key |
| `ADMIN_USER_IDS` | The UUID allowlist from the admin's local `.env`, **not an email address** |
| `SESSION_ENCRYPTION_KEY` | The admin's private 64-hex-character encryption key |
| `TERMINAL_URL` | `https://www.paybypalm.app/terminal` |
| `PAYMENT_API_BASE_URL` | `https://paybypalm-backend.onrender.com` (main backend origin) |
| `PAYSTACK_TEST_SECRET_KEY` | Private `sk_test_…` key from the same Paystack business as the backend |
| `PAYSTACK_LIVE_SECRET_KEY` | Private `sk_live_…` key from that same business; server only |

Keep `SESSION_ENCRYPTION_KEY` stable across deployments so existing cookies remain
valid. To generate a replacement privately, run
`node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`;
replacing it signs out existing admin sessions.

Deploy after saving these values:

```bash
cd /home/dell/PayByPalm/admin
npm run deploy:vercel
```

If importing from GitHub, select **Deploy** in Vercel instead. A later environment
change also requires a redeployment. The generated `*.vercel.app` address is not
the configured admin origin: use the custom domain for login. Preview environments
need their own exact `APP_ORIGIN` and environment values if you enable them.

The deploy script checks that `admin/.vercel/project.json` identifies
`paybypalm-admin` before preparing an upload. If the CLI mentions Root Directory
`wallet`, it is targeting the wrong project. If it cannot find `admin`, use the
repository-aware `deploy:vercel` script rather than a bare subdirectory upload.

### 3. Attach the subdomain to this project

Open **paybypalm-admin → Settings → Domains → Add Domain** and enter:

```text
admin.paybypalm.app
```

Add only this subdomain to the admin project. Keep the apex `paybypalm.app` and
`www.paybypalm.app` attached to the wallet project.

If Vercel manages DNS, follow its prompt to create/verify the record. If another
provider manages DNS, add a **CNAME** whose name is **admin**, with the **exact
value Vercel displays for this project**. Do not guess a generic CNAME target or
change the existing apex/www records. Wait for **Valid Configuration** and HTTPS
certificate provisioning.

Current project setup (19 October 2026): Vercel team `ayodeji63s-projects`,
project `paybypalm-admin`, Root Directory `admin`, production deployment
`https://paybypalm-admin.vercel.app`. The custom domain has been attached to this
project. Name.com hosts the domain's DNS. Vercel currently recommends this record:

| Type | Host | Answer |
| --- | --- | --- |
| CNAME | `admin` | `a2bce0bf9950dd8d.vercel-dns-017.com` |

Recheck Vercel's recommendation if recreating the project. After saving the
record, verify it with:

```bash
npx vercel domains verify admin.paybypalm.app --scope ayodeji63s-projects
```

### 4. Verify on the custom domain

Open `https://admin.paybypalm.app/health`; it should return JSON identifying
`paybypalm-admin`. Then open `https://admin.paybypalm.app` and sign in with the
approved account's existing password. Before sign-in, `/api/auth/session` should
return **401 JSON**, not the HTML page. Confirm the browser's API requests use
`https://admin.paybypalm.app/api/...`.

The cookie is HttpOnly, Secure, SameSite=Strict and host-only; it does not share
an administrator session with the wallet. Server checks require the configured
admin origin for writes. The customer's Render API CORS list does not need this
admin subdomain: the admin app talks to its own API. No database migration beyond
`db/0020_admin_onboarding.sql` is needed for the hosting change.

I have prepared the files locally; creating the Vercel project, setting its private
environment and attaching DNS require access to your Vercel account. None of those
external actions is performed by building this project.

### Optional Render deployment

`render.yaml` remains available to run both frontend and API in one persistent
Node service. Set `APP_ORIGIN` to that service's exact HTTPS origin, set the private
variables above (the Node helper setting is Vercel-specific), build with
`npm ci --include=dev && npm run build`, and start with `npm start`.

## Verification

```bash
npm test
npm run build
npm run guard:secrets
npm run preflight
npm run test:database   # Docker; disposable PostgreSQL, no live mutations
npx playwright install chromium
npm run dev            # keep running in another terminal
npm run test:browser   # test-only intercepted API fixtures
```

The database test uses a copy of the existing 0003 schema table definitions.
Browser screenshots are saved in gitignored `test-results/`. Test fixtures cannot
access live Supabase or create real merchants/terminals. The preflight is read-only
apart from calling guarded RPCs with null actors, which immediately raise before
any write. Its output shows schema readiness and verified-admin status only.


## Automatic merchant bank onboarding

Apply the complete `db/0023_merchant_payouts.sql` in the existing Supabase SQL
Editor after migration 0020. This is additive and rerunnable. Existing live
subaccount codes are preserved. The main payment backend already reads
`merchants.paystack_subaccount`; it needs no change to use a newly created live
code. Sandbox codes use a separate `paystack_test_subaccount` column.

Configure `PAYMENT_API_BASE_URL`, `PAYSTACK_TEST_SECRET_KEY` and
`PAYSTACK_LIVE_SECRET_KEY` once in the **admin Vercel project’s server environment**,
then deploy the backend and admin changes. The backend exposes only its non-secret
`paymentMode` at `/payment-settings`. The admin reads it at runtime and uses the
corresponding private server key. It no longer has an independent `PAYSTACK_MODE`;
any old admin value can be removed and is ignored. Existing `PAYSTACK_SECRET_KEY`
remains compatible only when its prefix matches the backend's active mode. To
switch automatically in both directions, configure the two named keys once.

After setup, change only `PAYSTACK_MODE` and its matching `PAYSTACK_SECRET_KEY`
on the main backend, then redeploy that backend. Admin Bank payouts updates on
focus, every 30 seconds while visible, and before creation. Test/live subaccounts
remain separate. Mode changes clear bank verification and consent, so the operator
must verify and confirm again. Every creation rechecks the backend after its
atomic database claim and before Paystack's POST. An already accepted POST is
completed using its original key and mode; it is never replayed in another mode.
Reconcile pending work before switching environments.

For a locally running main backend, set `PAYMENT_API_BASE_URL=http://127.0.0.1:8080`
in `admin/.env`. Otherwise local admin follows the configured Render backend.
The setting must be an HTTPS origin (HTTP loopback is allowed for development).
If the backend is unreachable or returns an invalid mode, bank payouts pause
without assuming test or live. Missing keys disable payouts only for their mode;
merchant and terminal management remain available. No Paystack secret belongs
in a frontend `VITE_` variable, the wallet, or a Pi.

A resolved name is displayed before the operator confirms account details and
PayByPalm's share. The default share is 0%, shown explicitly and confirmed before
creation. Paystack's `percentage_charge` is the **main business's percentage**, not
the merchant's percentage. Processing fees follow Paystack's payout rules.
Verification tokens are encrypted, expire after five minutes, and are bound to
the admin, merchant and mode. Database setup records retain the name, bank,
masked last four digits and a keyed fingerprint, not a plaintext account number.
The browser keeps account inputs/token only in component memory.

The durable claim is committed before the provider POST. Concurrent requests and
replays cannot create a second subaccount for that merchant/mode. After a timeout
or database-save failure, **Check status** finds the original uniquely marked
subaccount using provider GETs. A missing or ambiguous result stays unresolved;
it never blindly repeats POST. Only an explicit Paystack rejection permits a
new attempt. If the bounded search cannot find it, inspect Paystack before any
manual repair. Existing configured payout accounts are not replaced by this flow.

Creation and payout approval are separate. The app shows Paystack's returned
`is_verified` and `active` values, with **Check Paystack status** to refresh them.
Complete additional requirements with Paystack when requested; this app cannot
approve the provider's KYC. Automated tests use synthetic provider responses and
a disposable PostgreSQL container. No live merchant or bank account is created
by the tests.

Official API contracts: [bank-name resolution](https://paystack.com/docs/api/verification/#resolve-account),
[subaccount creation](https://paystack.com/docs/api/subaccount/#create-subaccount),
and [bank list](https://paystack.com/docs/api/miscellaneous/#list-banks).


## Local pnpm startup

This app also supports pnpm 11. Its `pnpm-workspace.yaml` explicitly allows the
three esbuild versions in `pnpm-lock.yaml` to run their required installation
scripts. Other dependency build scripts remain subject to pnpm approval.

If you switched this working copy from npm to pnpm, finish the installation and
rebuild the previously skipped binary packages before starting:

```bash
pnpm install --frozen-lockfile
pnpm rebuild esbuild
pnpm run dev
```

Use one package manager consistently for local installs. The first switch from
npm produces the “installed by a different package manager” notices; these do
not describe an application error. Vercel and Render keep their explicit npm
installation commands. No package-manager upgrade or payment configuration change
is required for this fix.

## Merchant portal access

Open a merchant record → **Merchant portal access**. Enter an existing verified
PayByPalm account email and choose **Grant merchant access**. Owners sign into
`merchant.paybypalm.app` with their own account; the grant gives read-only business
report access, without administrator privileges. **Revoke access** removes that
business grant after confirmation. This works with existing merchants such as Ayo
Stores and does not reprovision their terminals. Apply
[0024_merchant_portal.sql](../supabase/migrations/0024_merchant_portal.sql) first.
See [merchant setup and reporting rules](../merchant/README.md).
