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
5. With the **MAX98357A I²S amplifier**, use the pin allocation and configuration
   below. USB/HDMI audio remains an alternative. Keep the onboard PWM audio
   disabled when using the PWM LED driver, as described in [LEDS.md](LEDS.md).

The service worker caches only the allowlisted public WAV assets on demand; it
still never caches payment/authentication API responses. Failed audio loading or
missing speakers do not change financial decisions. On-screen instructions remain
available. Audition pronunciation, direction, volume and room noise on the physical
Pi: desktop fixture tests do not establish real-world audibility.

## MAX98357A with the LED ring (Pi 4)

The amplifier uses the PCM/I²S peripheral; the ring uses PWM0. They can use
separate peripherals, but **cannot share GPIO18**. Keep the amplifier wiring and
move only the ring's data connection to **BCM GPIO12, physical pin 32**. The old
LED code/default uses BCM GPIO18, physical pin 12. These numbers are different.

Power down the Pi and external LED supply before changing wires:

| Device/pin | Pi connection | Physical pin |
| --- | --- | --- |
| MAX98357A VIN | 5 V | 2 or 4 |
| MAX98357A GND | Ground | 6 or another ground pin |
| MAX98357A BCLK | BCM GPIO18 | 12 |
| MAX98357A LRC/LRCLK | BCM GPIO19 | 35 |
| MAX98357A DIN | BCM GPIO21 | 40 |
| Ring DIN | BCM GPIO12 through the existing level shifter/series resistor | 32 |

Retain the ring's regulated 5 V supply and common ground from [LEDS.md](LEDS.md).
Connect the speaker across the amplifier's **SPK+ and SPK−** outputs, not ground.
Leave GAIN at the module default for the initial test. A 5 V supply must cover
the Pi, amplifier and ring load without undervoltage.

**SD is module-dependent.** On the Adafruit-style breakout, the onboard pull-up
enables the amplifier with SD unconnected. Other modules may differ; check their
schematic rather than assuming a floating SD enables audio. SD held at ground
shuts the amplifier down. For a module confirmed to have its own enable pull-up,
edit `/boot/firmware/config.txt` (older OS: `/boot/config.txt`) and use:

```ini
dtparam=audio=off
dtoverlay=max98357a,no-sdmode
```

Keep only one active audio DAC overlay. Do not add this alongside an existing
`hifiberry-dac`/other I²S DAC overlay. `no-sdmode` means Linux does not drive SD;
it does not enable an electrically disabled amplifier. Alternatively, connect
SD to BCM GPIO4, physical pin 7, if free, and use `dtoverlay=max98357a` instead;
the driver then manages SD on GPIO4. Do not use both options.

Update the Pi checkout to this release and stop the kiosk before reinstalling:

```bash
cd ~/PayByPalm
systemctl --user stop paybypalm-kiosk
sudo bash pi/install-leds.sh --user "$(id -un)"
sudoedit /etc/paybypalm/led.json
```

Add **`"pin": 12`** to the existing JSON object, preserving its other settings.
The installer preserves existing settings, and omitting `pin` still means GPIO18
for older installations. Reinstalling alone does not move the signal. Once both
the wire and setting are changed, reboot for the audio overlay:

```bash
sudo reboot
```

After reboot, list the sound cards with `aplay -l`. Select the MAX98357A/I²S card
as the desktop's output so Chromium uses it. For a command-line test, substitute
the card's actual ALSA ID from that listing:

```bash
aplay -D plughw:CARD=YOUR_CARD_ID,DEV=0 ~/PayByPalm/wallet/public/audio/terminal/ready.wav
```

Use `plughw` for format/channel conversion; the recordings are mono, while the
I²S output may require stereo. Stop the kiosk before a standalone ring diagnostic:

```bash
systemctl --user stop paybypalm-kiosk
sudo /opt/paybypalm-led/venv/bin/python3 -I /opt/paybypalm-led/test-leds.py
~/.local/share/paybypalm/pi/start-kiosk-session.sh
```

The diagnostic reads the configured pin; `--pin 12` is an explicit override.
Then test actual camera positioning while speech plays, and check for ring
flicker, audio glitches and Pi undervoltage. The combination requires physical
verification; automated tests only verify pin selection and application behavior.

References: [Raspberry Pi MAX98357A overlay parameters](https://github.com/raspberrypi/firmware/blob/master/boot/overlays/README),
[WS281x PWM pins/peripheral limitations](https://github.com/jgarff/rpi_ws281x),
[MAX98357A pin behavior](https://learn.adafruit.com/adafruit-max98357-i2s-class-d-mono-amp/pinouts).

## Checks

From `wallet/`, run `pnpm test:security` for prompt replacement, recording integrity,
geometry and payment cue tests. `pnpm test:retake:browser` also exercises the
800×480 enrollment/payment flow with fake camera and payment responses, including
cancelled, unknown, failed and verified-success audio. It never charges real cards.
