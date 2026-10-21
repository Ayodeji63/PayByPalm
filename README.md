# PayByPalm

PayByPalm links a customer's payment card and palm so they can enrol once and
pay at a merchant terminal using their palm—without presenting a phone, card,
or QR code at checkout.

The original terminal camera is the default (`TENCENT_CAPTURE_MODE=legacy`).
The backend uses 1:1 comparisons across all active palm bindings; native 1:N
search is removed. H5 code remains available behind `TENCENT_CAPTURE_MODE=h5`.
See [capture setup and H5 test instructions](backend/PALM_H5_INTEGRATION.md).

## Team Members

- Olusanya Ayodeji
- Raji Mubarak
 
## 🚀 Live Demo

- **Live application:** [pay-by-palm.vercel.app](https://pay-by-palm.vercel.app/)
- **Backend API:** [paybypalm-backend.onrender.com](https://paybypalm-backend.onrender.com/health)
- **Merchant terminal:** [pay-by-palm.vercel.app/terminal](https://pay-by-palm.vercel.app/terminal)
- **Recorded demo:** [Demo Video](https://drive.google.com/file/d/1MOuOVUfxC5ENNYc7mOXj4nDjERYhAECG/view?usp=sharing)

> The merchant terminal requires a registered terminal key. Opening the terminal
> URL without one intentionally shows a configuration error.

## 🎯 The Problem

**How might we make everyday payments faster and more accessible when customers
cannot—or do not want to—depend on a phone, bank card, cash, or remembered PIN?**                                                                           

Conventional digital payments still require customers to carry an object, keep
it charged, unlock an application, or remember credentials. Those requirements
create friction at busy checkout points and exclude customers when a device is
lost, unavailable, or out of power.

## ✨ Our Solution

PayByPalm connects a customer wallet to a palm biometric through a secure,
single-use QR enrolment session. After enrolment, a customer places an open palm
in front of a Raspberry Pi merchant terminal. The terminal captures the palm,
the backend asks Tencent PalmAI to identify it, and the customer explicitly
confirms the payment before their linked card is charged.

The biometric provider receives only an internal user identifier and the
temporary capture. Application provider secrets stay on the backend; the reader
receives a short-lived capture token only when H5 is selected. Palm images are not stored by
PayByPalm, and provider operations are audited. A phone establishes identity
during enrolment. Payment requires a strong palm match and explicit card-payment
confirmation; a PIN does not override a failed match.

### Payment flow

1. The merchant enters the sale amount.
2. The customer presents an enrolled palm.
3. MediaPipe checks hand placement and steadiness on the terminal.
4. The backend compares the selected frame against every active registration
   through Tencent's 1:1 API and accepts exactly one strong match.
5. The customer reviews and confirms the payment.
6. Paystack charges the linked card; the backend records the verified outcome.

The restored camera supports the operator's controlled live tests when Paystack
live mode, a live reusable card and merchant settlement are configured. No pilot
account allowlist or extra amount cap is imposed. A camera image and local hand
placement guidance do not establish biometric liveness.

## 🛠️ Tech Stack

- **Frontend:** React 18, TypeScript, Vite, Tailwind CSS
- **Palm and QR detection:** MediaPipe Tasks Vision, ZXing, `qrcode.react`
- **Backend:** Node.js, Express, TypeScript, Zod
- **Database and authentication:** Supabase PostgreSQL, Better Auth and Resend
- **Biometric API:** Tencent PalmAI
- **Terminal hardware:** Raspberry Pi, OV5647 camera, 7-inch touch display,
  Chromium kiosk mode
- **Deployment:** Vercel for the wallet and terminal UI; Render for the API;
  Supabase for managed PostgreSQL and authentication
- **Package manager:** pnpm

## 🧱 Repository Structure

```text
admin/        Merchant onboarding, Paystack payout setup and terminal administration
merchant/     Separate business reports, settlements and terminal workspace
backend/      Express API, transaction services, PalmAI integration and tests
wallet/       Customer wallet and merchant-terminal React application
supabase/     Database migrations, row-level security and schema tests
pi/           Raspberry Pi kiosk launcher, environment template and setup guide
render.yaml   Render Blueprint for the production backend
```

## ⚙️ How to Set Up and Run Locally

### Prerequisites

- Node.js 22
- pnpm through Corepack
- A Supabase project
- Supabase CLI for applying migrations
- Optional Tencent PalmAI credentials; the mock provider works without them

### 1. Clone the repository

```bash
git clone https://github.com/Wema-Hackaholics-Hackathon/wema-hackaholics7-0-hackathon-yabatech-project-pay-by-palm.git
cd wema-hackaholics7-0-hackathon-yabatech-project-pay-by-palm
```

### 2. Apply the database migrations

```bash
npx supabase login
npx supabase link --project-ref YOUR_PROJECT_REF
npx supabase db push
```

The migrations in `supabase/migrations/` must be applied before seeding or
starting the API. See [supabase/README.md](supabase/README.md) for database
details and schema tests.

### 3. Configure and run the backend

```bash
cd backend
corepack enable
pnpm install --frozen-lockfile
cp .env.example .env
```

Populate the following values in `backend/.env`:

```dotenv
SUPABASE_URL=https://YOUR_PROJECT.supabase.co
SUPABASE_SERVICE_ROLE_KEY=YOUR_SERVICE_ROLE_KEY
AUTH_DATABASE_URL=YOUR_POSTGRES_SESSION_POOLER_URI
AUTH_SECRET=GENERATE_PRIVATELY_WITH_PNPM_AUTH_PREPARE
AUTH_BASE_URL=http://localhost:8080
RESEND_API_KEY=YOUR_RESEND_SENDING_KEY
RESEND_FROM_EMAIL=auth@YOUR_VERIFIED_DOMAIN

PALM_PROVIDER=mock
TENCENT_BASE_URL=https://open.intl.palm.tencent.com
TENCENT_PALM_API_KEY=

WALLET_BASE_URL=http://localhost:5173
EXTRA_CORS_ORIGINS=
```

Use `PALM_PROVIDER=mock` for local development. To test the real integration,
set `PALM_PROVIDER=tencent` and provide `TENCENT_PALM_API_KEY`.

```bash
pnpm auth:prepare
pnpm dev
```

The local API runs at `http://localhost:8080` by default.

### 4. Configure and run the wallet

Open another terminal:

```bash
cd wallet
pnpm install --frozen-lockfile
cp .env.example .env
```

Set the API address in `wallet/.env`:

```dotenv
VITE_API_BASE_URL=http://localhost:8080
```

Then start Vite:

```bash
pnpm dev
```

Open `http://localhost:5173` for the customer wallet. The terminal route is
`http://localhost:5173/terminal?k=YOUR_REGISTERED_TERMINAL_KEY`.

### 5. Raspberry Pi kiosk

The kiosk launcher reads `KIOSK_URL` and `TERMINAL_KEY` from
`/etc/paybypalm/terminal.env`, then starts Chromium with a persistent profile
and MediaPipe asset cache. Follow the complete hardware and installation guide
in [pi/README.md](pi/README.md).

Never commit a real terminal key, Supabase service-role key, or Tencent API key.

## Custom domain CORS on Render

The API allows the exact `WALLET_BASE_URL` origin plus the comma-separated
`EXTRA_CORS_ORIGINS`. `https://www.paybypalm.app` and `https://paybypalm.app`
are separate browser origins. Configure both on the **backend Render service →
Environment**:

```dotenv
EXTRA_CORS_ORIGINS=https://www.paybypalm.app,https://paybypalm.app
```

Append these to any existing extra origins you still need. Use exact origins
with the scheme and no path or trailing slash. Select **Save and deploy** so the
backend reloads its configuration. Editing a local `.env` or Vercel's environment
does not update Render. The Blueprint includes these public origins for deployments
managed through `render.yaml`.

This CORS change leaves `WALLET_BASE_URL` and existing redirect destinations intact.
When moving email verification, Paystack callbacks and enrolment QR links to the
custom domain, first allow `https://www.paybypalm.app/auth/confirm` in Supabase
Auth's redirect URLs, then set Render's `WALLET_BASE_URL` to
`https://www.paybypalm.app`. Keep the old Vercel origin in `EXTRA_CORS_ORIGINS` if
existing clients or Pi configurations still use it.

Verify the browser's preflight without creating an account:

```bash
curl -i -X OPTIONS https://paybypalm-backend.onrender.com/auth/signup \
  -H 'Origin: https://www.paybypalm.app' \
  -H 'Access-Control-Request-Method: POST' \
  -H 'Access-Control-Request-Headers: content-type'
```

Expected: HTTP 204 and `Access-Control-Allow-Origin: https://www.paybypalm.app`.
An `origin_not_allowed` response means that origin is still absent from the
running service's configuration.

## ✅ Verification

```bash
# Backend
cd backend
pnpm typecheck
pnpm test

# Wallet
cd ../wallet
pnpm typecheck
pnpm build
pnpm guard:secrets

# Database invariants (requires Docker)
cd ..
./supabase/tests/run.sh
```

The backend test suite covers image validation, palm-match policy, database
queries, phone normalization and the mock biometric provider. The database
tests verify ledger balance, replay protection, overdraft prevention and RLS.

## 🔐 Security and Privacy

- Tencent credentials are read only by the backend.
- The terminal authenticates separately with `X-Terminal-Key`.
- Palm images are held in memory for one request and are not persisted by
  PayByPalm.
- Tencent receives an internal UUID rather than a customer's name or phone.
- Palm-provider success and failure responses are written to an audit trail.
- Payment authentication and payment confirmation are separate operations.
- Wallet balances are derived from an atomic double-entry ledger.

## Current Prototype Limitations

- Match thresholds require calibration with the final camera and lighting.
- The current prototype does not implement biometric liveness detection.
- Top-ups are sandbox ledger credits; no real banking rail moves funds.
- A stable, well-lit camera view is required for reliable palm recognition.

These limitations are explicit so the prototype can be evaluated honestly and
extended safely.


## Admin app and Git workflow

The merchant admin app is in [admin/](admin/README.md). It is part of this Git
repository and deploys as the existing Vercel project `paybypalm-admin` at
`admin.paybypalm.app`, with **Root Directory = admin**. The wallet keeps its own
Vercel project with **Root Directory = wallet**; Render keeps **rootDir = backend**.

```bash
cd admin
pnpm install --frozen-lockfile
pnpm run dev
```

Local private configuration and the admin's existing Vercel binding are ignored.
For a fresh checkout, copy `admin/.env.example` to `admin/.env` and configure its
values privately. Follow the admin README for the one-time migrations and hosted
server environment. Deployments do not require credentials in Git.

Commit and push changes from the PayByPalm repository:

```bash
git status
git add admin/                 # or name the other files changed
git commit -m "Describe the change"
git push origin main
```

The primary remote is `origin` (`Ayodeji63/PayByPalm`). The hackathon remote stays
available as `submission`; push there explicitly when intended. The admin source
is ordinary tracked files, so GitHub shows its directory without a separate
repository checkout. The guarded admin CLI deployment is
`pnpm --dir admin run deploy:vercel`; Git deployments use the configured `admin`
Root Directory automatically.

## Merchant workspace

The separate [merchant app](merchant/README.md) targets `merchant.paybypalm.app`.
Administrators grant verified accounts access from each merchant record in Admin.
Run migration `0024_merchant_portal.sql` and deploy the updated backend/admin before
using the portal. It follows the backend payment mode and separates card payments
from Paystack bank settlements.

## Authentication cutover

Accounts, passwords and sessions now use Better Auth; Resend delivers verification and recovery emails. Supabase remains the database. Before deploying this release, complete the coordinated UUID-preserving steps in [AUTH_MIGRATION.md](AUTH_MIGRATION.md).
