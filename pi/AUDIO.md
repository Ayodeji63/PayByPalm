# Terminal audio guidance

The terminal uses the 15 operator-provided WAV recordings from
`wallet/public/audio/terminal/`. All are mono, 24 kHz, 16-bit PCM. They are served
by the wallet deployment, preloaded when the terminal opens, and played through
one audio element. Speech does not block capture, identification or payment calls.

## Event mapping

| Recording | Trigger |
| --- | --- |
| `ready.wav` | Camera positioning begins for a payment or claimed enrollment |
| `move_left.wav`, `move_right.wav` | Hand is horizontally outside the centered guide |
| `move_closer.wav` | Hand is too small in the preview |
| `move_back.wav` | Hand is too large or clipped by the frame |
| `open_hand.wav` | The existing hand check detects fingers that need opening |
| `palm_flat.wav` | Edge-on/remaining positioning geometry needs correction |
| `hold_still.wav` | Stability guidance or capture acquisition |
| `scan_complete.wav` | The camera burst completed; **not** a payment confirmation |
| `processing.wav` | Explicit payment confirmation, enrollment retry, or a reader request still pending after the capture cue |
| `retry_scan.wav` | A rejected/failed scan needs another capture |
| `payment_pending.wav` | A customer-confirmed payment has an unknown result and needs recovery |
| `payment_failed.wav` | The backend reports a definitive failed payment |
| `cancelled.wav` | Cancellation is confirmed |
| **`success1.wav`** | A verified, matching payment receipt is received; once per transaction in the terminal session |

Enrollment completion and palm recognition never play `success1.wav`, because
that recording announces a successful payment. The supplied README refers to
`success.wav`; the integration follows the operator's actual `success1.wav` file.

Directional prompts use the existing unmirrored camera-preview coordinates.
Verify physical left/right movement against the installed camera orientation.
The flat-palm hint is geometric guidance, not a calibrated liveness check or a
change to biometric thresholds. Existing hand-position and stability gates remain.

Only the current instruction is spoken. A positioning change must persist for
500 ms; repeated guidance is suppressed/throttled. A new relevant prompt replaces
the previous one, and navigation clears pending instructions. An uncertain result
never announces failure, success or an invitation to start another charge.

## Deployment and speaker setup

1. Deploy the updated **wallet**. The audio is included in its `public/` assets;
   no separate copying to the Pi or new device credential is required.
2. Reload/restart the existing Pi kiosk. Its launcher already permits autoplay.
   Ordinary browser testing starts audio from the New sale or Enrol button tap.
3. Use **Sound on / Sound off** on the idle screen. The preference is stored on
   that terminal. **Enable sound** retries if browser playback was blocked.
4. In the Pi desktop sound settings, select the connected speaker and set a
   comfortable volume. Test a recording before taking live payments.
5. If the GPIO18 WS2812 ring is enabled, keep its PWM/audio conflict configuration
   from [LEDS.md](LEDS.md). Use a **USB audio device/speaker or HDMI audio** rather
   than re-enabling the competing onboard PWM audio driver.

The service worker caches only the allowlisted public WAV assets on demand; it
still never caches payment/authentication API responses. Failed audio loading or
missing speakers do not change financial decisions. On-screen instructions remain
available. Audition pronunciation, direction, volume and room noise on the physical
Pi: desktop fixture tests do not establish real-world audibility.

## Checks

From `wallet/`, run `pnpm test:security` for prompt replacement, recording integrity,
geometry and payment cue tests. `pnpm test:retake:browser` also exercises the
800×480 enrollment/payment flow with fake camera and payment responses, including
cancelled, unknown, failed and verified-success audio. It never charges real cards.
