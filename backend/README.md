# PayByPalm — Backend

Node + TypeScript + Express API for palm-biometric payment on a closed-loop campus wallet.

## What this service guarantees

**The palm provider credential never leaves this process.** `TENCENT_PALM_API_KEY` is read
in exactly one file, [`src/palm/tencent.ts`](src/palm/tencent.ts). The Pi posts an image to
us; we call Tencent. It is never in browser JS, never on the device, never in a response body.

**Nothing is debited without an explicit Confirm tap.** `POST /transactions/:id/authenticate`
identifies a person and writes zero ledger entries. The only code path in this service that
moves money is `POST /transactions/:id/confirm`.

**Every biometric call is audited.** A decorator in [`src/palm/audit.ts`](src/palm/audit.ts)
wraps the provider, so success *and* failure both write a `palm_audit` row with the provider's
request id, score, latency, and error code. There is no way to reach the provider around it.

**Palm images are never persisted.** Held in memory for one request, forwarded, dropped.
Not written to disk, not inserted into a table, not logged — the logger redacts the field by
path regardless.

**Two authentication planes, kept apart.** The wallet holds a Supabase user JWT; terminals
hold a device key. No route accepts both. A stolen terminal key cannot act as a user.

## Setup

```bash
cd backend
pnpm install
cp .env.example .env     # then fill it in
pnpm dev
```

Apply the database migrations first — see [`../supabase/README.md`](../supabase/README.md).

## Deploying on Render

The repository includes a Render Blueprint at [`../render.yaml`](../render.yaml). It declares
this directory as the service root, installs the locked pnpm dependencies, builds TypeScript,
starts `dist/index.js`, and checks `/health` after deployment.

1. Push this repository to GitHub, GitLab, or Bitbucket.
2. In Render, choose **New → Blueprint** and connect the repository. Render detects the
   root-level `render.yaml` automatically.
3. Supply the values Render requests during Blueprint creation:
   `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY`, `WALLET_BASE_URL`, and
   `TENCENT_PALM_API_KEY`. The Tencent key can be left unused while `PALM_PROVIDER=mock`.
4. Deploy the Blueprint, then confirm `https://<service-name>.onrender.com/health` returns
   `{"status":"ok", ...}`.

The Blueprint starts with `PALM_PROVIDER=mock`, so the Tencent credential is not read. To use
Tencent, set `PALM_PROVIDER=tencent`; the Blueprint already declares both
`TENCENT_BASE_URL` and the secret `TENCENT_PALM_API_KEY`.

Render supplies `PORT` automatically; do not hard-code it in the Blueprint. Before deploying,
apply the Supabase migrations and seed data described in the database README. A `503` health
response means the service started but cannot query Supabase—usually because the database
migrations or one of the Supabase environment values is missing.

### Running with no Tencent access

`PALM_PROVIDER=mock` is the default, and the entire application works end to end on it: enrol
a palm, pay with a palm, see the money move. That removes the biggest schedule risk in a short
build — waiting on third-party credentials — and makes the payment flow testable in CI.

The mock needs to know whose palm it is looking at. Two ways:

- send `X-Mock-User: <supabase-user-id>` on the request, or
- post `mock:<user-id>` (base64 encoded) as the image.

`MOCK_PALM_SCORE` controls the returned score, so all three policy branches can be exercised
on demand: **92** → accept, **78** → step-up, **50** → reject.

Switching to the real thing is one variable:

```bash
PALM_PROVIDER=tencent
TENCENT_PALM_API_KEY=ak_xxxxx
```

## Match policy

Set in [`src/palm/policy.ts`](src/palm/policy.ts), which is the only module allowed to branch
on a score.

| Score | Decision | Effect |
|---|---|---|
| `>= PALM_ACCEPT_SCORE` (85) | `accept` | Confirm tap alone completes the payment |
| `>= PALM_STEP_UP_SCORE` (70), below accept | `step_up` | Wallet PIN required at confirm |
| below `PALM_STEP_UP_SCORE`, or no match | `reject` | Retry; nothing is charged |

These are **our** thresholds, deliberately independent of the provider's own `IsMatch` verdict —
a provider tuned for convenience will call a marginal match a match, and we are deciding whether
to move someone's money. Both numbers land in `palm_audit` so they can be compared.

> **These defaults are a starting point, not measured values.** Real thresholds should come
> from `palm_audit` data collected on the actual Pi camera under the actual kiosk lighting.
> A threshold chosen by intuition is the most likely cause of a failed live demo.

## Endpoints

Set up for the examples below:

```bash
API=http://localhost:8080
TERMINAL_KEY=pbp_dev_terminal_key_001      # from supabase/seed.sql
```

### Health

```bash
curl $API/health
```

Reports which palm provider is live — "why did matching stop working?" is nearly always
"it is running on mock", or the reverse.

### Auth

Phone is the identity anchor; there is no email field. Supabase Auth needs an address, so one
is derived from the phone number internally — see [`src/lib/phone.ts`](src/lib/phone.ts).

```bash
# Sign up
curl -X POST $API/auth/signup -H 'Content-Type: application/json' -d '{
  "fullName": "Ada Okonkwo",
  "phone": "08010001001",
  "password": "palmpay2026",
  "pin": "2468"
}'

# Log in
curl -X POST $API/auth/login -H 'Content-Type: application/json' \
  -d '{"phone":"08010001001","password":"palmpay2026"}'

# Refresh
curl -X POST $API/auth/refresh -H 'Content-Type: application/json' \
  -d '{"refreshToken":"<refresh-token>"}'
```

```bash
TOKEN=<accessToken from the response>
```

### Wallet — user JWT

```bash
# Profile, derived balance, enrolment status
curl $API/me -H "Authorization: Bearer $TOKEN"

# History (paginated)
curl "$API/transactions?limit=25&offset=0" -H "Authorization: Bearer $TOKEN"

# One transaction
curl $API/transactions/<id> -H "Authorization: Bearer $TOKEN"

# Flag a payment
curl -X POST $API/transactions/<id>/dispute -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' -d '{"reason":"I was not at this terminal"}'

# Change the wallet PIN
curl -X POST $API/me/pin -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' -d '{"currentPin":"2468","newPin":"1379"}'

# Simulated top-up — ₦5,000. Sandbox only; see the note at the bottom.
curl -X POST $API/topup -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' -d '{"amountMinor":500000}'
```

### Enrolment — one time per user

The terminal creates a session and shows a QR. The phone scans it and claims it. Identity comes
from the **phone**, authenticated with a user JWT; the terminal only proves a device and
captures an image. That is what stops a terminal operator from enrolling their own palm against
someone else's wallet.

```bash
# 1. Terminal creates a session (90s TTL). linkUrl goes into the QR code.
curl -X POST $API/enrol/sessions -H "X-Terminal-Key: $TERMINAL_KEY"
# -> { "sessionId": "...", "expiresAt": "...", "linkUrl": "http://localhost:5173/scan/<id>" }

SESSION=<sessionId>

# 2. Phone claims it. 409 already_enrolled if this user already has a palm linked.
curl -X POST $API/enrol/sessions/$SESSION/claim -H "Authorization: Bearer $TOKEN"

# 3. Terminal polls until status is 'claimed'
curl $API/enrol/sessions/$SESSION -H "X-Terminal-Key: $TERMINAL_KEY"

#    ...or streams it (SSE). Polling above stays fully functional as the fallback.
curl -N $API/enrol/sessions/$SESSION/stream -H "X-Terminal-Key: $TERMINAL_KEY"

#    The phone watches its own session while showing "place your palm"
curl $API/enrol/sessions/$SESSION/mine -H "Authorization: Bearer $TOKEN"

# 4. Terminal captures and registers.
#    On mock, `mock:<user-id>` base64-encoded stands in for an image.
IMG=$(printf 'mock:%s' "$USER_ID" | base64 -w0)
curl -X POST $API/enrol/sessions/$SESSION/palm -H "X-Terminal-Key: $TERMINAL_KEY" \
  -H 'Content-Type: application/json' -d "{\"imageB64\":\"$IMG\"}"

# Unlink, so the user can enrol again later (soft revoke — history is kept)
curl -X POST $API/palm/revoke -H "Authorization: Bearer $TOKEN"
```

Re-posting step 4 on a completed session is a no-op and returns the same result, so a retry
after a flaky response cannot enrol twice.

### Payment — palm only, no phone, no QR

```bash
# 1. Terminal states an amount (₦1,250 = 125000 kobo)
curl -X POST $API/transactions -H "X-Terminal-Key: $TERMINAL_KEY" \
  -H 'Content-Type: application/json' \
  -d '{"amountMinor":125000,"description":"Lunch"}'

TXN=<transactionId>

# 2a. PRODUCTION PATH — last4 narrows the gallery, then 1:1 comparisons
curl -X POST $API/transactions/$TXN/authenticate -H "X-Terminal-Key: $TERMINAL_KEY" \
  -H 'Content-Type: application/json' \
  -d "{\"imageB64\":\"$IMG\",\"last4\":\"1001\"}"

# 2b. DEMO PATH — pure 1:N search, nothing typed
curl -X POST $API/transactions/$TXN/authenticate -H "X-Terminal-Key: $TERMINAL_KEY" \
  -H 'Content-Type: application/json' -d "{\"imageB64\":\"$IMG\"}"

# -> { "decision":"accept", "mode":"search", "score":92,
#      "maskedName":"Ada O.", "maskedBalanceMinor":2000000, "pinRequired":false }
#    NO LEDGER ENTRY HAS BEEN WRITTEN AT THIS POINT.

# 3. The Confirm tap. This is the only call that moves money.
curl -X POST $API/transactions/$TXN/confirm -H "X-Terminal-Key: $TERMINAL_KEY" \
  -H 'Content-Type: application/json' -d '{}'

#    When decision was step_up, the PIN is required:
curl -X POST $API/transactions/$TXN/confirm -H "X-Terminal-Key: $TERMINAL_KEY" \
  -H 'Content-Type: application/json' -d '{"pin":"2468"}'

# Or abandon it
curl -X POST $API/transactions/$TXN/cancel -H "X-Terminal-Key: $TERMINAL_KEY"
```

Whether a PIN is required is re-derived at confirm from the stored match score, never trusted
from the client — a terminal cannot skip step-up by omitting a flag.

Confirming more than `AUTH_VALIDITY_SECONDS` (60s) after the scan fails with
`stale_authentication`. A palm match left sitting on a screen is not a statement about who is
standing there now.

### The last4 path, and why it exists

A 1:N search across a whole campus gallery has a false-match rate that grows with the gallery.
Typing four digits collapses the candidate set to a handful, and each is then checked 1:1.
That is the path a real deployment uses; the pure-palm path is the demo.

If more than `MAX_CANDIDATES` (4) users share those four digits, the request is rejected with
`ambiguous_bin` and the terminal asks for more digits — rather than comparing an arbitrary
subset and letting the answer depend on row order.

## Error responses

Every error has the same shape:

```json
{
  "error": { "code": "insufficient_funds", "message": "Insufficient balance" },
  "requestId": "0f1c…"
}
```

Branch on `code`, never on `message`. `requestId` is echoed in the `X-Request-Id` header and
ties together every log line for the request, including the provider call.

| Code | Status | Meaning |
|---|---|---|
| `validation_failed` | 400 | `details` carries a message per field |
| `image_too_large` / `image_invalid` | 400 | Palm image rejected before any provider call |
| `unauthorized` | 401 | Missing/expired token, unknown terminal key, wrong PIN |
| `insufficient_funds` | 402 | Balance below the amount |
| `forbidden` | 403 | Authenticated, but not yours |
| `not_found` | 404 | Also returned for another terminal's transaction, so ids cannot be probed |
| `already_enrolled` | 409 | Enrolment is one-time |
| `session_expired` / `session_already_claimed` | 409 | QR handshake failed |
| `stale_authentication` | 409 | Palm scan older than the validity window |
| `invalid_transaction_state` | 409 | Includes replayed confirms |
| `palm_provider_error` | 502 | `details.requestId` is the provider's own id — quote it to support |

## Testing

```bash
pnpm test        # unit tests, no network, no database
pnpm typecheck
```

50 tests cover the match-policy boundaries (84 vs 85, 69 vs 70), image validation and size
limits, phone canonicalisation, terminal display masking, and the mock provider's matching
behaviour.

Database invariants — balanced ledger writes, overdraft refusal, replay protection, RLS
isolation — are tested separately against a real Postgres:

```bash
../supabase/tests/run.sh
```

### End-to-end against a live Supabase

The unit suite deliberately makes no network calls. For a full run, point `.env` at a real
Supabase project, apply the migrations, then:

```bash
pnpm seed        # 5 users, ₦20,000 each; prints logins and the terminal key
pnpm dev
```

and walk the enrolment and payment curl sequences above with `PALM_PROVIDER=mock`.

## Deployment (Render)

- Build: `pnpm install && pnpm build`
- Start: `pnpm start`
- Health check path: `/health`

Set every variable from `.env.example`. `WALLET_BASE_URL` must be the deployed wallet origin —
it is both the CORS allow-list and the base of the enrolment link encoded into the QR code.

**Keep this at a single instance.** The provider rate limiter in
[`src/lib/rateLimiter.ts`](src/lib/rateLimiter.ts) is an in-process token bucket, correct only
for one instance. Horizontal scaling needs a shared limiter.

## Hackathon scope, stated plainly

`POST /topup` credits a wallet from the system float account. **No real money moves.** It is
the seam where a real funding rail plugs in: an inbound Wema NIP or virtual-account webhook
would verify that money actually arrived and then call the same `post_topup()` database
function. The ledger shape does not change; only the trigger for calling it does.

The wallet app labels these funds as sandbox, and it should stay that way in any demo.
