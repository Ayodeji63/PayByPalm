# PalmX H5 integration and pilot testing

The terminal defaults to the original PayByPalm camera interface, configured on
the backend with `TENCENT_CAPTURE_MODE=legacy` (also the default when unset). It
uses the existing 1280x720 camera request, white illumination, off-thread hand
placement guidance and three-frame sharpness selection. JPEG images are posted
over HTTPS to the backend for Tencent registration and 1:1 comparison against
every active palm binding. Native 1:N search is removed from the provider contract,
Tencent adapter, mock and audit decorator. Historical search audit rows are kept.

H5 v1.3 remains implemented and tested behind `TENCENT_CAPTURE_MODE=h5`. In the
default mode, the terminal does not load Tencent's H5 script, iframe or WASM or
request an SDK token. The following H5 flow describes that opt-in only.

Both modes require exactly one provider-confirmed match, reject ambiguous or
incomplete sweeps, recheck bindings for changes, and keep card charging behind
explicit confirmation. Raw-image capture is restricted to Paystack test mode:
local placement guidance is not biometric liveness. Restoring the interface does
not confirm Tencent supports this application's legacy RGB request format; verify
it with a real test enrolment and comparison. Existing provider codes remain intact.

Enrolment uses the atomic `complete_h5_palm_enrolment` RPC from migration 0021 in
both modes, despite its historical name. That already-applied migration and all
existing registrations/cards/payment history are preserved.

## Capture and payment flow

1. A registered terminal creates a sale using the existing stable sale reference.
2. `POST /transactions/:id/palm-capture` checks terminal ownership and pending
   status, loads all active palm bindings, and issues a capture grant.
3. The grant contains a short-lived Tencent SDK token and the approved loader
   URL. The application API key remains on the backend. The token belongs to a
   new `capture_<random-id>` identity with no customer palms; a shared merchant
   terminal is never given a provider credential for an enrolled customer.
4. The H5 SDK runs acquisition-only (`enableManager=false`,
   `enableImageOnly=true`, `enableLogReport=false`). Its registration acquisition
   mode is used as a neutral capture mode, with no registered hand selected.
   **It does not register the temporary identity or perform a cloud comparison.**
5. The SDK returns encrypted `ImageData.payload`. It includes RGB and liveness
   images, their integrity digests, SDK metadata and the short-lived token.
   The frontend submits only `{captureId,payload}` to the existing authenticate
   route. A client `isMatch`, target user or score cannot authorize a payment.
6. The backend validates the payload, atomically consumes its terminal/sale grant,
   checks the issued token hash, and rejects a previously submitted encrypted
   capture. Only hashes and operation metadata are stored, never images/tokens.
7. All active bindings whose profiles remain enrolled are read with keyset
   pagination. The backend sends the encrypted image pair to Tencent's
   `compare_rgb_palm` once per candidate, with server-selected `CompareUserId`
   and `CheckAppQuality=true`. It requires a complete sweep, exactly one positive
   provider verdict, and the existing payment acceptance score. Zero/multiple
   matches, provider errors, invalid results and a 45-second sweep deadline fail
   closed. No fixed ten-user cap or phone-digit filter is applied.
8. The pool is checked again for enrolment/revocation changes. The successful
   identity and active default card are attached to the pending transaction.
9. The customer confirms the amount/card using the existing **Pay from card**
   action. Existing Paystack charge idempotency and reconciliation remain in use.

This is an application-coordinated series of 1:1 checks, not native Tencent 1:N.
Work and biometric false-match exposure grow with the entire enrolled pool.
Large pools may exceed the deadline and are rejected rather than partially
searched. Increasing the pool is not a substitute for vendor approval and
measured biometric calibration.

## Enrolment and unlinking

The terminal QR and authenticated phone claim still establish the customer
identity. Only the owning terminal can obtain a capture grant for a claimed,
unexpired enrolment session. Backend registration uses `IsForce=false`; it never
silently overwrites another registration. If registration returns only `UserId`,
the backend obtains the active `PalmId` from Tencent's `get_palm` response.

Migration 0021 saves the binding, profile flag and completed session in one
transaction. Unlinking retains the existing provider-first deletion, verifies
provider absence, then clears database bindings/profile status. No palm reset,
deletion or migration of existing registrations is part of this update.

## Important vendor compatibility boundary

**Image-only mode skips Tencent's video upload and cloud calls.** The backend
requires an encrypted liveness image and application quality checks, but does
not invent an `ActionLiveness.VideoFileId`, claim a video was verified, or accept
a browser verdict. Whether Tencent accepts this capture/token for registration
and across different comparison targets must be established with real scans.

The generic H5 guide does not promise cross-user reuse. The live SDK's request
fields were inspected to implement the existing RGB endpoint contract. Its
encrypted image-only output and the backend image/target requests are the
compatibility experiment; mocked tests do not establish Tencent support.

`PAYSTACK_MODE=test` allows this compatibility test. Live card capture is blocked
unless `TENCENT_H5_IMAGE_ONLY_APPROVED=true`. Leave it false until Tencent confirms
all of the following and real-device tests pass:

- Capture using a temporary SDK identity without registering that identity.
- Server-side use of its encrypted capture and `UserToken` under the application's
  API key, for a different registration/`CompareUserId` and multiple candidates.
- The application's image-only liveness requirements, including whether uploaded
  video is mandatory. If video is mandatory, this mode cannot be approved; use a
  vendor-supported video/batch capture contract instead.
- Score scale, match thresholds and anti-replay guarantees for this capture mode.

If Tencent requires SDK-performed verification, its `sessionId` must be checked
using `get_session_result`, with freshness/transaction binding established. This
integration does not use that alternative: the backend receives the actual
comparison responses directly, and never trusts callback comparison results.

`enableLogReport=false` suppresses additional diagnostic image/video replicas,
but Tencent's final session trace is always reported. Biometric processing still
occurs at Tencent. Landscape touchscreens (`pointer: coarse`) may cancel SDK
acquisition with code 10002; test the actual Pi touchscreen/orientation.

## Deployment

1. Apply `supabase/migrations/0021_palm_h5_captures.sql` in the intended Supabase
   project's SQL Editor. It is additive and safe to rerun. It preserves existing
   users, registrations, cards and payments. The project owner applied it to the
   current hosted project, and the follow-up preflight verified both RPCs.
2. Deploy the backend and wallet together. For the restored camera, set
   `TENCENT_CAPTURE_MODE=legacy` in Render (or leave it unset), and reload the Pi
   terminal. No Pi package, browser-profile reset or new device key is required.
   Only set `TENCENT_CAPTURE_MODE=h5` when deliberately testing the retained H5
   implementation; raw-JPEG requests are rejected in that mode. A mode change
   requires a fresh enrolment session/scan, not reuse of an old SDK grant.
3. Keep the existing backend-only `TENCENT_PALM_API_KEY`, `TENCENT_BASE_URL` and
   test Paystack configuration. No API key goes into Vercel frontend variables or
   Pi files. The H5 iframe API origin is controlled by Tencent's SDK deployment,
   independently of `TENCENT_BASE_URL`.
4. From `backend`, run `pnpm palms:h5:preflight`. It checks schema/RPC readiness,
   candidate loading, the public loader and a transient SDK token. It submits no
   images, registrations, comparisons, deletions or payments. Token issuance is
   a real provider call; the credential is never printed or saved.
5. Reload the Pi terminal, complete the matrix below, and inspect only provider
   request IDs/error codes in logs. SDK callback codes (10001 etc.) are distinct
   from gateway/backend business codes (100xxxx/206xxxx/208xxxx).

## Test matrix

- Existing registered user: the enrolled hand matches; opposite/unregistered hand
  and another person's hand do not authorize that user's card.
- New enrolment: phone claims QR, H5 capture succeeds, provider registration and
  all three database changes finish before the terminal reports linked.
- Two distinct enrolled users: the same capture is compared against both, the
  correct identity wins, and cross-target token/image compatibility is confirmed.
- Unknown palm: no match, no authenticated transaction and no charge.
- Multiple positive matches: reject without selecting the first/highest score.
- Camera denial, network interruption, token expiry, provider quality/liveness
  failure, orientation cancellation and quota errors: recover with a fresh scan.
- Lost authenticate response: cancel/recover the existing sale; do not create a
  second sale or bypass an already-consumed grant. Lost enrolment responses can
  be checked from the wallet's existing enrolment status.
- Changed/revoked binding during comparisons, a duplicated request, and a reused
  capture under another sale/terminal: no authorization.
- Confirm explicitly using Paystack test cards only; check a single charge and
  stable reference on retries. Capture alone must never initiate a charge.

## Automated checks

- `cd backend && pnpm test && pnpm typecheck && pnpm build`
- `cd wallet && pnpm test:security && pnpm build && pnpm guard:secrets`
- `python3 supabase/tests/palm_h5_migration_test.py` (disposable Docker Postgres)
- `wallet/tests/palm-h5-browser.mjs` against a local Vite server, with Playwright
  available. Set `PLAYWRIGHT_MODULE` / `PLAYWRIGHT_CHROMIUM_EXECUTABLE` if using an
  external test installation. Browser tests use SDK/API fixtures only.
- `wallet/tests/palm-legacy-browser.mjs` against the same server: original payment
  and enrolment screens, synthetic 1280x720 camera, JPEG submission, white
  illumination and explicit card confirmation; asserts there are no H5 requests.
  Hand guidance and APIs are fixtures; no real Tencent or Paystack requests.
- Optional `cd wallet && node tests/palm-sdk-camera-browser.mjs`, with the same
  Playwright environment variables: uses the real deployed Tencent reader and a
  synthetic Chromium camera, an invalid token, and blocks external writes. It
  checks camera startup and iframe sizing, not licence validation or matching.

## Landscape touch terminals and CSI cameras

Tencent v1.3 cancels acquisition with SDK 10002 before `getUserMedia` when its
iframe reports both landscape orientation and a coarse pointer. The wrapper
temporarily gives only the approved reader iframe a centered 3:4 portrait viewport
on these screens. A CSS rule applies before the iframe initializes and responds
to viewport changes. Desktop and portrait readers keep their full viewport. The
rule/backdrop are removed on completion, failure or cancellation. No SDK code,
origin validation, camera resolution or biometric checks are modified.

A real-SDK browser reproduction at 800x480 with touch input confirmed zero camera
requests and cancellation without the adapter; a 360x480 iframe opened the
synthetic camera and played video. This does not establish Pi frame rates or CSI
camera compatibility. The supplied SDK has no documented resolution/frame-rate
setting; do not substitute raw frames or disable liveness to improve performance.

For CSI diagnosis independent of Tencent/Chromium, follow the
[Pi camera checks](../pi/README.md#csi-camera-and-slow-reader-checks). A detected
sensor that subsequently reports Unicam buffer I/O errors or device timeouts is
not a working stream. Repair that problem before testing browser acquisition.

Hosted preflight during implementation confirmed one active candidate, a
reachable H5 loader, and issuance of an isolated user token. It also found that
the gateway serializes `ExpiresAt` as a string; the adapter accepts explicit
numeric seconds and ISO timestamps. After the project owner applied migration
0021, hosted preflight also passed table access and both validation RPC checks.
Real Pi capture and cross-user comparison compatibility remain unverified.
