# Local CCNet checkout rollout

The CCNet API runs on the PC in Docker; the existing Render backend is its only
PayByPalm client. The Pi sends captures to Render using its terminal credential.
Render holds the CCNet credential. Keep the existing Paystack **live** settings.
Only the customer's Pay tap requests a card charge; nothing in setup or tests
charges a live card. There is no Vercel gateway, DNS change or Tencent fallback.

## Start the PC

From the CCNet repository:

```bash
python3 scripts/local.py start
python3 scripts/local.py status
python3 scripts/prepare_paybypalm.py
```

The command creates a dedicated backend key once, preserves existing credentials
and the named SQLite volume, warms inference and hand detection, then starts
ngrok with `--inspect=false`. Only localhost port 8000 is published by Docker.
It reports the HTTPS URL without displaying credentials. Its ignored
`runtime/local/public-url` pins subsequent starts to the same assigned address.
`python3 scripts/local.py stop` stops the managed processes without deleting data.
Do not run `docker compose down -v`, remove the volume, or rotate existing keys.

In Render, open the existing backend service → **Environment** → **Add from .env**.
Import the ignored private file `CCNet/secrets/paybypalm-render.env` into the
existing Render backend's environment:

| Setting | Value |
| --- | --- |
| `PALM_PROVIDER` | `ccnet` |
| `CCNET_BASE_URL` | The HTTPS origin reported by `status` |
| `CCNET_API_KEY` | Dedicated credential from the private file |
| `CCNET_MATCH_TIMEOUT_MS` | `5000` |
| `CCNET_ENROLL_TIMEOUT_MS` | `20000` |
| `PALM_ACCEPT_SCORE` | `50` (current provisional testing threshold) |
| `PALM_STEP_UP_SCORE` | `40` (legacy band; does not authorize CCNet checkout below 50) |
| `ENROL_SESSION_TTL_SECONDS` | `300` |

Choose **Save, rebuild, and deploy** after the migration and release are ready.
Render documents this bulk-import flow at https://render.com/docs/configure-environment-variables.

Preserve all `PAYSTACK_*`, encryption, database, authentication and terminal
credentials. Retain `TENCENT_*` values for history/support; Tencent cannot be
selected as an active provider in this release. Never put the CCNet credential
in a `VITE_` variable, a kiosk URL, Pi configuration or browser storage.

## Publish the prepared release

The GitHub app must have repository write access, or this PC must have Git push
credentials. A 403 from the connected app does not publish any changes.
After committing the tested release, authenticate Git on this PC if needed:

```bash
gh auth login --web --git-protocol https
gh auth setup-git
cd /home/dell/PayByPalm/backend
node --import tsx scripts/release-ccnet.ts
```

The helper checks a clean main branch and a dry-run push **before** changing the
live schema. It applies pending migrations 0027, 0028 and 0029 with their
migration-ledger records atomically, then pushes the same tested release.
An interrupted push can be retried using the same command. It never invokes
payment endpoints. Import the prepared settings
into Render and select **Save, rebuild, and deploy** after successful publishing.
Existing Paystack and Tencent environment values stay in place.

## Coordinate the cutover

1. Finish tests and build both backend and wallet/terminal from this release.
2. Start the PC and check public readiness and an unauthenticated `/v1` rejection.
3. Apply pending migrations in order: `0027_ccnet_provider.sql`,
   `0028_live_operations_and_retakes.sql` and `0029_ccnet_checkout_threshold.sql`.
   These retain accounts, cards, Tencent bindings and payment history, add live
   operation tracking and safe retakes, and set the database checkout floor to 50.
   Use the release helper or a reviewed migration workflow that preserves the
   existing migration ledger; do not blindly rerun already-applied SQL.
4. Set the Render values above and deploy the backend and terminal release
   together. `/health` must report `palmProvider: "ccnet"`; `/terminal/me` must
   report `captureMode: "ccnet"`. Existing processing payments keep reconciling.
5. Existing users sign in to the same account and enroll three fresh CCNet
   captures. Tencent enrollment alone does not enable CCNet checkout. Confirm
   the wallet's provider-specific enrollment status before testing payment.

The migration blocks new charge claims authorized by Tencent. Rollback to the
old backend alone will not re-enable Tencent checkout. Keep the service in
CCNet mode or have an administrator review any deliberate provider rollback.
Never bypass the new binding checks to recover a processing payment.

The PC must stay awake, powered and online. Keep ngrok running and monitor your
account's free usage in the ngrok dashboard. A tunnel outage or exhausted quota
returns a retryable reader error; it never triggers Tencent calls. Back up the
SQLite volume and credential files securely if you need to preserve enrollments
across a PC failure. These files contain biometric templates or credentials.

## Enrollment API

Every terminal endpoint requires `X-Terminal-Key`. Phone claim/unlink endpoints
require the existing authenticated user session. Terminal identity does not let
a caller choose an account to enroll: the signed-in phone claims the QR session.

1. `POST /enrol/sessions` creates `{sessionId, expiresAt, linkUrl, captureMode}`.
2. The signed-in phone calls `POST /enrol/sessions/:id/claim`.
3. Terminal polls `GET /enrol/sessions/:id` for `status: "claimed"`.
4. Terminal calls `POST /enrol/sessions/:id/palm`:

```json
{"imagesB64":["<JPEG frame 1>","<JPEG frame 2>","<JPEG frame 3>"],"palmSide":"right"}
```

Each decoded image is limited to 512 KiB. Three distinct image hashes, an active
owned session and a valid side are required. The Pi preserves aspect ratio and
caps the longest edge at 960 pixels. Captures are held in memory only. An opaque
session UUID names the upstream subject; it contains no account identity.

A database lease serializes registration attempts. The fingerprint binds retries
to the original images and side. An uncertain result retains its lease for up to
70 seconds: retry the same in-memory captures after that period. A successful
completion is idempotent even after session expiry. After a definitive capture
rejection, the backend resets the failed fingerprint and permits three fresh
frames in the same active QR session. An expired session requires a new QR.
Unknown writes or failed reset attempts retain the original captures for retry.
Independent sessions never overwrite the completed session's upstream subject.
Orphan templates cannot enter payment searches.

`POST /palm/revoke` revokes CCNet bindings locally before upstream deletion.
Offline/in-flight cleanup reports `palm_unlink_incomplete`; retry unlinking to
finish deletion. Tencent records and their upstream state are preserved. The
response never claims Tencent templates were deleted.

## Payment API and policy

Keep the current transaction API and financial recovery flow:

1. `POST /transactions` with a stable `saleId`, amount and optional description.
2. `POST /transactions/:id/authenticate` with `{imageB64}`. This identifies a payer
   and returns masked payer/card details only after a full accept.
3. Show payer, card and amount. The customer's single Pay tap calls
   `POST /transactions/:id/confirm`.
4. Show success only from the verified receipt. Retain the same sale/transaction
   when a response is uncertain; check status/reconcile rather than starting
   another charge. Existing idempotency and card verification checks remain.

Render supplies all active CCNet bindings as the bounded `eligible_palms` list
and asks `/v1/identify` for two candidates. One embedding searches that gallery
once. The adapter validates response shape, identity, ordering, finite scores,
positive verdict and selected subject. It rejects candidates outside the list.
Scores are `floor(100 * cosineSimilarity)`, clamped to 0–100. The highest raw
similarity wins when the reader verdict is positive and its score reaches
`max(50, PALM_ACCEPT_SCORE)`; the current configured acceptance score is 50.
A lower second candidate above 50 does not disqualify the winner. An exact
highest-similarity tie between different users requires a retake. A PIN does not
override this policy. The 40 step-up setting is a legacy band, not a lower CCNet
checkout threshold. Similarity is not a confidence percentage; these testing
thresholds are not deployment-calibrated.

Eligible bindings are reloaded after the search. Authentication records the
exact immutable binding ID; database guards validate it again on authentication
and at the charge claim. Revocation/replacement before a claim blocks charging.
A claim already acquired continues through existing payment reconciliation.
The standalone CCNet API retains its independent provisional 0.50 thresholds.

Transport uses Node's pooled HTTP connections, bounded response reads, no
redirects and separate match/enrollment deadlines. HTTP 503 reader errors carry
`Retry-After`; the terminal displays a recovery message. Audit records contain
provider, opaque request ID, score, verdict, timing and error classification,
never captures or credentials.

## Verification and measurements

```bash
cd backend && pnpm test && pnpm typecheck && pnpm build
cd ../wallet && pnpm test:security && pnpm typecheck && pnpm build
cd .. && bash supabase/tests/run.sh
```

The database suite runs in disposable Docker PostgreSQL; payment network
responses are mocked. `supabase/tests/ccnet_migration_test.py` applies the full
current schema and exercises real concurrent reservations and charge claims.
It covers Tencent preservation, fingerprint retries, revocation/replacement,
double Pay and reconciliation. No test charges a real card.

The terminal preloads its hand worker while ready and leases the camera during
amount entry. It checks motion, framing and openness at most every 100 ms with
one worker frame in flight. At least three valid observations spanning 300 ms
are required. White illumination still settles for 300 ms before the three
captures, spaced 100 ms apart. Enrollment sends all three; payment sends the
sharpest. Manual capture stays available if guidance fails.

Local browser timing entries are `palm.capture`, `palm.authenticate` and
`palm.stable_to_pay`. `Server-Timing` from CCNet splits `extract`, `embed`, `search`;
the audited adapter adds total `transport_ms`. Backend logs time eligible-binding
database reads and Paystack requests separately. Browser Resource Timing gives
upload-to-response timing. Network residuals include upload, tunnel routing and
response transfer; do not report them as exact tunnel-only latency. Use packet
or network tracing on the real Pi to separate those components further.

Use at least 30 repeated real Pi trials with 1–50 active users, recording:

| Field | Record |
| --- | --- |
| Trial type | genuine payer / consenting impostor / no enrolled palm |
| Capture and LED | exposure, three frames, illumination warning, cancellation |
| Network | upload bytes, upload/response time, tunnel/connection timing |
| Matching | extraction, embedding, gallery/database timing |
| User result | accept / genuine rejection / impostor accept / ambiguity |
| Checkout | stable palm to Pay screen; Pay tap to verified bank receipt |
| Outages | camera denied/missing, PC asleep, tunnel offline, retry/recovery |

Targets: local matching p95 ≤300 ms; stable palm to Pay screen p95 ≤1.5 s.
A public sample and synthetic templates test throughput only. They provide no
real genuine rejection or impostor rate. Those and the end-to-end Pi target
remain unverified until device trials. Record failed trials alongside latency;
never lower thresholds or show success before bank verification to improve it.
NFC/payment-rail speed cannot be inferred from local matching measurements.
