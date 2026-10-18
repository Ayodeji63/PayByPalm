# Enrollment conflict and Pi preview responsiveness

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
