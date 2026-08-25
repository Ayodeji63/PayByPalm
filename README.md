# PayByPalm

PayByPalm is a closed-loop biometric wallet that lets a customer enrol once and
pay at a merchant terminal using their palm—without presenting a phone, card,
or QR code at checkout.

## Team Members

- Olusanya Ayodeji
- Ojo Mubarak

## 🚀 Live Demo

- **Live application:** [pay-by-palm.vercel.app](https://pay-by-palm.vercel.app/)
- **Backend API:** [paybypalm-backend.onrender.com](https://paybypalm-backend.onrender.com/health)
- **Merchant terminal:** [pay-by-palm.vercel.app/terminal](https://pay-by-palm.vercel.app/terminal)
- **Recorded demo:** Loom link coming soon.

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
confirms the payment before the ledger is updated.

The biometric provider receives only an internal user identifier and the
temporary capture. Provider credentials never enter the browser or Raspberry
Pi, palm images are not stored by PayByPalm, and every provider request is
audited. A phone and four-digit wallet PIN remain available for enrolment and
step-up verification.

### Payment flow

1. The merchant enters the sale amount.
2. The customer presents an enrolled palm.
3. MediaPipe checks hand placement and steadiness on the terminal.
4. The backend submits the selected frame to Tencent PalmAI.
5. The customer reviews and confirms the payment.
6. A PostgreSQL double-entry ledger settles the transaction atomically.

## 🛠️ Tech Stack

- **Frontend:** React 18, TypeScript, Vite, Tailwind CSS
- **Palm and QR detection:** MediaPipe Tasks Vision, ZXing, `qrcode.react`
- **Backend:** Node.js, Express, TypeScript, Zod
- **Database and authentication:** PostgreSQL and Supabase Auth
- **Biometric API:** Tencent PalmAI
- **Terminal hardware:** Raspberry Pi, OV5647 camera, 7-inch touch display,
  Chromium kiosk mode
- **Deployment:** Vercel for the wallet and terminal UI; Render for the API;
  Supabase for managed PostgreSQL and authentication
- **Package manager:** pnpm

## 🧱 Repository Structure

```text
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
SUPABASE_ANON_KEY=YOUR_ANON_KEY

PALM_PROVIDER=mock
TENCENT_BASE_URL=https://open.intl.palm.tencent.com
TENCENT_PALM_API_KEY=

WALLET_BASE_URL=http://localhost:5173
EXTRA_CORS_ORIGINS=
```

Use `PALM_PROVIDER=mock` for local development. To test the real integration,
set `PALM_PROVIDER=tencent` and provide `TENCENT_PALM_API_KEY`.

```bash
pnpm seed
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
