# Enrollment conflict and Pi preview responsiveness

## Tencent error codes returned to the app

The RGB API error table supplied by the user matches the currently published
table: https://palm.tencent.com/docs/palm-api/错误码 . All 38 supplied codes are
classified in `src/palm/tencentErrors.ts`. The Open API guide separately lists
`206...` and `208...` codes: https://palm.tencent.com/docs/kyc-api . Both tables
remain supported because actual service responses have used the latter codes.
Codes are never renumbered or inferred from an arithmetic offset.

Examples:

| Tencent code | Interpretation / recovery |
| --- | --- |
| `1001004` / `2080003` | Liveness failed; capture a real palm again |
| `1001005` / `2080004` | Image quality failed; improve framing, stability and lighting |
| `1001008` / `2080007` | Already bound; verify the existing account, no forced rebinding |
| `1001019` / `2080013` | Verification expired; start a new scan |
| `1001023` | Database operation failed **or** user deleted; do not assume which |
| `1001029` / `2080020` | Platform feature quota exhausted; administrator action |
| `1001030` | Required mid-air palm feature is not licensed |
| `1001032` / `2080023` | Provider application missing; administrator action |

API failures include a fixed, actionable explanation and the original numeric
Tencent code in `error.message`. Allowlisted `error.details` contain `provider`,
`providerCode`, `providerDescription`, `providerRequestId` and
`providerHttpStatus`, when available. Top-level `requestId` remains PayByPalm's
backend request ID, distinct from Tencent's ID. Raw SDK diagnostics are not sent
to clients. Unknown codes remain visible as unknown failures; the observed
code-999 alignment signature retains its specific handling described below.

Non-2xx JSON responses are parsed for their business code and request ID rather
than replacing the code with an HTTP status. A non-JSON response retains its
HTTP status separately; it does not invent a Tencent business code. Only code
zero on a successful HTTP response can produce a successful operation.

Search codes `1001013` and `2080010` produce a normal no-match rejection, never a
verified payer. Their original code/request ID remain in provider logs. During
post-deletion GetPalm checks only `1001012` / `2080009` on HTTP 200, or verified
empty palm records, establish absence. An ambiguous error, authentication error
or unsuccessful HTTP status does not authorize clearing database bindings.

Deploy the updated backend on Render for these messages; no migration or Pi
credential change is required. These classifications improve diagnostics and
recovery, but do not repair provider configuration or establish successful
live matching. Regression tests use mocked provider responses.

## 1:1 comparison: observed alignment error

At 04:43:13 Lagos time on 18 October 2026, the digits lookup reached Tencent's
`compare_rgb_palm`, which returned code `999` with this diagnostic:
`call palm alignment sdk err: call PalmAlignGap by rect fail, ret=-360`.
Provider request ID: `b666b41df2ab3c9aba1e75b539d3b490`.

This establishes an alignment-stage failure, not a successful identity match or
a card decline. The precise meaning of the internal `-360` return value was not
found in the reviewed public documentation. Image framing, blur, palm orientation,
lighting and provider SDK behavior are possible causes, not confirmed diagnoses.
No captured palm image is retained, so the actual failed frame cannot be inspected.

The source submits the full-resolution camera JPEG, rather than MediaPipe's small
guidance preview. The three-frame ranking measures whole-frame sharpness; hand
landmarks and that ranking do not guarantee Tencent can align the palm image.
Present the enrolled palm facing the camera, keep the whole hand visible, avoid
tilt/movement, and use even illumination without glare. A clear repeat capture
that still fails should be escalated with the provider request ID and diagnostic.

The backend maps only this exact code/signature to HTTP 422,
`palm_image_alignment_failed`, with a fixed recapture instruction. Other code-999
responses retain their generic error treatment. Deploy the backend for the new
message. Matching thresholds, image format, capture logic and payment flow have
not been changed by this error-classification fix. The 1:N `2080023` application
failure is a separate observed problem.

## Payment search: application missing

A later read-only audit check found a successful registration at
`2026-10-18T02:39:26Z` and an active local binding. Three subsequent `search`
calls failed with code `2080023`; the latest provider request ID was
`5d537512d9b520907ad8fcadd2bd3099`. The user clarified that the new key was
used for both registration and search. Tencent documents `2080023` as
`app does not exist`:
https://api-docs.intl.palm.tencent.com/docs/kyc-api/

This establishes a provider application error, not a failed identity match.
There is no confirmed credential mismatch. The audit does not record which key
was used; the reason registration works while search fails remains unconfirmed.

Keep the registration key in Render and ask the credential issuer to check
the associated application's RGB search configuration using the request ID.
The documented URL is `/palm/openai/search_rgb_palm`; it returned an application
error rather than an HTTP route-not-found error. Do not swap keys speculatively.
If intentionally using a different application, coordinate
enrollment migration with its administrator; do not delete local bindings or
silently mark a palm verified to bypass the error. No enrollment/payment API was
called during this investigation, and no provider or database records were changed.

The backend now returns HTTP 503 with code `palm_application_unavailable` and a
fixed application-configuration explanation. Capture errors include the backend
request reference for log correlation. Deploy these backend/wallet changes for
the improved message; they do not repair Tencent's application configuration.

## Earlier registration conflict

The supplied 18 October 2026 logs contain one failed registration call:
`/palm/openai/register_rgb_palm`, provider code `2080007`, message `already bound`.
The provider returned an application error, so this particular failure is not
proof of a network outage. Provider request reference:
`9df9fd454f4845974234688a23442f8b`.

A read-only check of the affected Supabase account found `palm_enrolled=false`,
zero palm binding rows, and one failed registration audit with that provider code.
No provider template, account, image or local registration was changed by the
investigation. This establishes inconsistent local/provider enrollment state;
it does not establish the identity of the existing provider registration's owner.
An earlier database reset did not remove Tencent's external templates, but that
is only a possible explanation for this specific conflict, not proven ownership.

## Resolve the provider state

1. Locate the request/reference in the Tencent account/tenant used by the Render
   backend. Ask the Tencent administrator/support if only the API key is available.
2. Determine which provider user ID and palm record caused the conflict. Check
   against the intended Supabase account and its active/archived binding history.
3. If it belongs to another valid account, use/recover that account; do not transfer
   a biometric identity because another user claims it.
4. If the administrator confirms an obsolete test registration, remove only that
   specific obsolete record through the authorized Tencent process, then create a
   fresh enrollment session and capture again. Do not delete all palms/accounts.
5. If this is a partial enrollment that should remain valid, reconcile its actual
   provider palm ID and ownership before restoring local records. Do not invent a
   palm ID, set `palm_enrolled=true` alone, or enable forced re-registration.

The current supplied logs and configured API do not provide the old registration
owner/palm ID needed for automatic safe reconciliation. This change intentionally
keeps `IsForce:false`. The application now returns HTTP 409, code
`palm_already_bound`, with a fixed safe explanation. Unknown provider errors still
hide raw diagnostics. The terminal stops automatic enrollment retries after an
error; an explicit retry is available after the underlying issue is resolved.

## Camera changes

MediaPipe previously executed `detectForVideo` on the touchscreen's main thread.
Google documents that it is synchronous and recommends a worker for video:
https://developers.google.com/edge/mediapipe/solutions/vision/hand_landmarker/web_js

Placement guidance now uses a classic dedicated worker with the same pinned
MediaPipe 1.0.1 CPU model/WASM. Only one preview frame is in flight, resized to at
most 384 pixels wide. No frame queue can accumulate. The worker closes transferred
bitmaps and times out failed/hung work. Model failures leave manual Capture
available. A later camera retry can obtain a fresh worker after initialization
failure. Synthetic browser tests exercised the actual SDK and model; the pinned
CDN SDK was also checked to match the locally tested SDK bytes.

Full-resolution camera capture remains 1280x720 preferred, with the same existing
three-frame JPEG/sharpness selection. Only guidance previews are downscaled.
Preview frame rate prefers 24 fps and caps at 30; actual hardware/lighting may
produce fewer frames. This removes a confirmed source of UI blocking; it does
not measure or guarantee the physical Pi camera's final frame rate.

With the installed optional LED bridge, ready-camera placement now keeps moderate
white illumination on, including while the user positions their hand. The same
steady white is used for capture. The white watchdog is renewed every five seconds
while the positioning screen remains active. Heartbeats stop during acquisition/
processing; white is off before blue processing. This avoids requiring MediaPipe
to detect a hand in an otherwise dark preview before illumination starts. Camera/
model errors remain timed red, and canceled scopes cannot overwrite new captures.

Tune brightness/exposure on the real Pi and check power/wiring if the ring does
not illuminate. Worker inference does not correct a disconnected/obscured camera,
long low-light camera exposure, inadequate LED power or a driver bottleneck.
Follow `pi/LEDS.md` for the electrical and brightness checks.

## Deploy and verify

Deploy the updated **wallet and backend**, not just Pi scripts. The new worker
file must be included at the wallet site's root:
`/palm-recognition.worker.js` (JavaScript, not the SPA HTML fallback). Keep the
native LED bridge installed on the Pi and restart the kiosk after deployment.
No Supabase schema migration or database reset is needed for these changes.

From the laptop repository, stage the worker as well as its callers/tests:

```bash
git add wallet backend/src/middleware/errors.ts backend/src/apiSecurity.test.ts backend/PALM_TROUBLESHOOTING.md pi/LEDS.md
git commit -m "Handle palm enrollment conflicts and move Pi guidance off the UI thread"
git push origin main
```

Verify the new production wallet deployment and backend deployment both succeed.
Then restart the Pi kiosk using
`~/.local/share/paybypalm/pi/start-kiosk-session.sh`.

Development checks: backend tests/typecheck/build; wallet security tests/build;
actual MediaPipe worker + synthetic-camera browser fixture in
`wallet/tests/palm-worker-browser.mjs`. That optional fixture requires Playwright
and the official model at `/tmp/pbp-hand-landmarker.task` (the model URL is fixed
in the worker source). The test serves the installed SDK/WASM and official model
locally to separate runtime behavior from CDN connectivity. It verifies five real
inferences, a responsive UI timer/button, and preservation of the 1280x720 source.
No real palm image, external registration or payment is used in that test.
