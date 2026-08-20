# PayByPalm — Wallet

The customer app. React + Vite + TypeScript + Tailwind, mobile-first, deployed to Vercel.

**This app is deliberately not needed to pay.** It exists to check a balance, add funds, and —
exactly once — link a palm. After that, the phone stays in the pocket.

## Setup

```bash
cd wallet
pnpm install
cp .env.example .env      # point VITE_API_BASE_URL at your API
pnpm dev
```

Open http://localhost:5173.

## Four pages, deliberately

| Route | What it does |
|---|---|
| `/` | **Landing** — the pitch and one way in. Anyone with a session skips straight to the dashboard. |
| `/login` | **Auth** — sign in and sign up in one page, two modes. Phone is the identity anchor; no email field. |
| `/dashboard` | **Dashboard** — balance card, quick actions, statistics, history |
| `/scan`, `/scan/:sessionId` | **Scan** — the one-time palm enrolment flow |

Plus one route that is not part of the customer app at all:

| Route | What it does |
|---|---|
| `/terminal` | **Merchant kiosk** — 800x480, Chromium kiosk on a Raspberry Pi. See [`../pi/README.md`](../pi/README.md) |

The terminal is mounted in `main.tsx` **outside** `AuthProvider`. A terminal is a device, not a
user: it authenticates with `X-Terminal-Key` and must never hold or poll a customer session.
Both are lazy-loaded, so a phone never downloads the kiosk and a Pi never downloads the QR
decoder.

Top-up, profile/settings, and transaction detail are **bottom sheets** on the dashboard rather
than routes of their own — see [`src/components/sheets.tsx`](src/components/sheets.tsx). Nothing
was lost in that consolidation: changing a PIN, unlinking a palm, and disputing a payment all
still work.

## The two things this app gets right on purpose

### An enrolled user is never asked to enrol again

When `palmEnrolled` is false, the dashboard shows a prominent **Link your palm** card. When it
flips to true, that card does not shrink or become dismissible — it disappears entirely, and the
balance card's status line reads "Palm linked" instead. Enrolment state lives in the Profile
sheet from then on.

The route is guarded to match: `RequireNotEnrolled` in [`src/App.tsx`](src/App.tsx) redirects
`/scan` to the dashboard for anyone already enrolled. And if the backend still returns
`409 already_enrolled` — say the user enrolled on another device a second ago — the flow routes
to the dashboard rather than throwing a red error at someone whose only mistake was already
being finished.

### The balance updates while you watch

[`src/lib/auth.tsx`](src/lib/auth.tsx) polls `/me` every **3 seconds** while the app is visible
and focused, and every 15 seconds when it is not. It also refreshes immediately when the tab
becomes visible again, so a phone that was in a pocket during a payment is correct on unlock.

When the balance drops between polls, money just left the wallet at a terminal, and the app
raises a toast — `₦1,250 paid`.

Two deliberate choices here:

- **3s, not the 10s originally specified.** At 10 seconds the update reads as a coincidence.
  At 3 it reads as a reaction, which is the entire demo: a judge pays with their palm and
  watches their phone respond.
- **Polling, not a websocket.** Supabase realtime on `ledger_entries` would be tidier and is
  worth layering behind this, but polling has no connection to drop in a room full of people
  on the same wifi. Reliability beats elegance for the one moment that has to work.

## Design

One accent colour, generous whitespace, large type for money, no gradients, no shadows — depth
comes from hairline borders and surface contrast. Tokens live in [`src/index.css`](src/index.css).

Money is rendered **only** by `formatNaira()` in [`src/lib/money.ts`](src/lib/money.ts), from
bigint minor units, with tabular figures so digits do not jitter as a balance updates. It never
rounds up: an overstated balance is the one error that makes someone think they can pay.

The wordmark is a neutral placeholder. **This app never uses Wema Bank's name, logo, or
trademarks.**

Every screen has explicit loading skeletons, empty states, and error states. Errors surface the
backend's `requestId` in small print — it is the handle support needs to trace a failed match.

## Camera and QR scanning

Enrolment scans the terminal's QR with `@zxing/browser`. Two things follow from that:

**`getUserMedia` needs a secure context.** It works on `localhost` and over HTTPS, and *not*
over a plain LAN IP. To test on a real phone during development, use a tunnel (`ngrok`,
`cloudflared`) or serve over HTTPS. In production Vercel is HTTPS, so this is a development-only
concern. The scanner surfaces a specific message for a blocked camera versus an unavailable one.

**The QR can also be scanned by the phone's own camera app.** The terminal encodes
`${WALLET_BASE_URL}/scan/<sessionId>`, which opens this app directly at `/scan/:sessionId` and
skips straight to claiming. Both paths converge on the same code.

The scanner releases the camera on unmount — without that the indicator light stays on after
navigating away.

## Build

```bash
pnpm build
pnpm guard:secrets
```

Output is code-split so the QR decoder — the heaviest dependency, needed by exactly one screen,
once per user — stays out of the initial download:

```
dist/assets/index-*.js    202 kB │ gzip:  65 kB   ← every visit
dist/assets/Scan-*.js     419 kB │ gzip: 110 kB   ← only when enrolling
```

### `guard:secrets`

[`scripts/guard-secrets.mjs`](scripts/guard-secrets.mjs) greps the built bundle for the Tencent
API key pattern, `service_role`, the palm provider hostname, and private key blocks — and fails
the build on a hit.

The project's hardest rule is that those credentials live in backend environment variables and
nowhere else. A rule enforced only by discipline eventually loses to a late-night "just for now"
import. **Run this in CI, before deploying.**

## Deployment (Vercel)

- Framework preset: **Vite**
- Build command: `pnpm build`
- Output directory: `dist`
- Environment: `VITE_API_BASE_URL` = your Render API URL

A SPA rewrite is already committed in `vercel.json`, so deep links like `/scan/<id>` resolve —
without it a QR scan opens a 404.

Then set `WALLET_BASE_URL` on the **backend** to this app's deployed origin. It is both the CORS
allow-list and the base of the enrolment link encoded into every QR code.
