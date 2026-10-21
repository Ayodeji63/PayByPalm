# PayByPalm merchant workspace

Separate, read-only merchant app for **merchant.paybypalm.app**. It shares verified
PayByPalm identities with the wallet, but uses its own encrypted, HttpOnly session.
An account needs an explicit administrator grant for each business. Being a customer,
knowing a merchant ID, or setting a role in user metadata does not grant access.

Merchants can review daily payment totals, filter and inspect card payment attempts,
export CSV records, read Paystack settlement status, check terminal contact times and
view their business and masked bank details. Administrators manage access, terminals
and bank destination changes in the separate admin app.

## Database setup

In the existing Supabase project's SQL Editor, run the complete contents of
[0024_merchant_portal.sql](../supabase/migrations/0024_merchant_portal.sql).
It is additive and rerunnable; it preserves current payments, merchants and terminals.
It depends on existing admin migrations 0020 and 0023 and payment mode migration 0022.
The new membership/session tables and reporting view cannot be accessed directly with
an anonymous or signed-in Supabase client. Server credentials remain private.

Deploy the updated main backend and admin app with this migration. The main backend
provides `/merchant/overview`, `/merchant/transactions`, `/merchant/settlements`,
`/merchant/terminals`, `/merchant/settings` and `/merchant/export`. Every request
requires a centrally verified user session token and a current membership for the requested business.

## Grant access, including an existing merchant

1. The merchant owner needs an existing PayByPalm account with a confirmed email and
   password. They can create and verify that account through the existing wallet signup.
2. In PayByPalm Admin, open **Merchants**, then the business (for example Ayo Stores).
3. Under **Merchant portal access**, enter the verified account email and choose
   **Grant merchant access**. The grant is recorded in admin activity.
4. The owner signs into the merchant workspace with that account's email and password.
5. To remove access, choose **Revoke access** and confirm. Subsequent report requests
   recheck membership. An account with several businesses can switch between its grants.

No new merchant record, card, palm or terminal key is needed for an existing business.
Merchant self-invites and role changes are not available in this version.

## Local development

Use Node 22 or 24 and the pinned pnpm version:

```bash
cd merchant
cp .env.example .env
corepack pnpm install --frozen-lockfile
```

Privately set `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` for
the same project as the backend/admin. Generate an independent 32-byte
`SESSION_ENCRYPTION_KEY` using the command in `.env.example`. Do not reuse an admin
cookie key or put server secrets in `VITE_*` variables.

Set `PAYMENT_API_BASE_URL=http://localhost:8080` for a local payment backend, or
retain the hosted backend address. No Paystack or Tencent key belongs in this app.

```bash
pnpm run preflight
pnpm run dev
```

Open **http://127.0.0.1:5193**. Vite proxies same-origin API requests to the merchant
server on 8093. `APP_ORIGIN` must exactly match the address you open. Use 127.0.0.1
consistently; localhost is a different origin. The main backend must be running and
have the new reporting routes. A fresh database also needs existing abuse-budget RPCs.

## Financial reporting rules

- Payment mode comes from the main payment backend on every report. No frontend
  build flag or independent merchant Paystack configuration is needed. Switching the
  backend mode changes the portal on refresh, tab focus or its visible-tab poll.
  Test and live payment attempts and payout subaccounts stay separate.
- **Paid card payments are not bank settlements.** Overview totals are gross verified
  card charges. Bank settlement statuses and amounts come separately from Paystack,
  using the selected merchant's current-mode subaccount filter. The payout column
  uses Paystack's reported `effective_amount`, including its adjustments. The portal never
  infers a bank payout from a successful sale or shows an invented wallet balance.
- The reporting view joins transactions to card payment attempts for their
  authoritative mode. Abandoned scans with no charge attempt are not included.
- Payment date filters use Africa/Lagos business days; the CSV labels UTC timestamps
  and integer kobo amounts. Reports accept at most 366 days per request. Payment
  lists paginate 25 rows; aggregate totals cover all matching records, including more
  than Supabase's usual REST page limit.
- CSV exports honor the active business, dates, status, exact reference and mode,
  escape spreadsheet formulas, and stop with a narrowing instruction above 5,000
  payments. They do not silently truncate a larger export.
- Settlement records come from Paystack's [settlements API](https://paystack.com/docs/api/settlement/#list-settlements).
  The backend resolves the owned numeric subaccount ID first and never falls back to
  a platform-wide payout list. Provider failures display a retryable error. Actual
  settlement timing and eligibility remain controlled by Paystack.
- Reports omit payer identity, biometric data, authorization tokens and device keys.
  Terminal contact timestamps indicate the last request, not a guaranteed live connection.

## Vercel

Create a **separate** Vercel project named `paybypalm-merchant` linked to the existing
`Ayodeji63/PayByPalm` GitHub repository. Set **Root Directory** to `merchant`,
framework Vite, Node 22 or 24. Keep the wallet and admin project links unchanged.
The included `vercel.json` builds the frontend plus same-origin Express API function.

Set server environment variables from `.env.example`, with:

```text
NODE_ENV=production
APP_ORIGIN=https://merchant.paybypalm.app
PAYMENT_API_BASE_URL=https://paybypalm-backend.onrender.com
TRUST_PROXY_HOPS=1
NODEJS_HELPERS=0
```

Use an independent private `SESSION_ENCRYPTION_KEY`. Add `merchant.paybypalm.app`
under this project's Domains and copy Vercel's **actual** CNAME target into Name.com
for host `merchant`. The admin DNS record is unrelated and should not be changed.
No browser CORS addition is needed for reports: the merchant server contacts the
payment backend directly. Preview writes require the configured exact `APP_ORIGIN`;
use a separate preview environment/database when testing previews.

Git pushes deploy through the project connection. For CLI deployments, link only
this app and use the guarded wrapper, which stages the repository `merchant/`
layout and excludes `.env`, credentials, test artifacts and other apps:

```bash
cd merchant
npx vercel link --yes --project paybypalm-merchant
pnpm run deploy:vercel -- --dry-run
pnpm run deploy:vercel
```

## Validation

```bash
pnpm test
pnpm run build
pnpm run guard:secrets
pnpm run test:database  # Docker; disposable PostgreSQL 17; no hosted writes
pnpm run test:browser  # Vite must be running on 127.0.0.1:5193
```

Browser tests intercept API requests with labeled synthetic fixtures and never sign
into a real account. Security tests cover tenant isolation, grants/revocation,
encrypted sessions, exact-origin checks and read-only proxy behavior. Main backend
tests cover reporting scopes, payment modes, full exports and settlement ownership.

## Authentication replacement

Follow [AUTH_MIGRATION.md](../AUTH_MIGRATION.md) for the coordinated Better Auth and Resend cutover. Existing user UUIDs and merchant memberships remain unchanged. Login uses `PAYMENT_API_BASE_URL`; this app does not need a Resend key or the PostgreSQL password. Existing sessions must sign in again. Apply 0024 before 0025; do not reapply older identity-dependent functions afterward.
