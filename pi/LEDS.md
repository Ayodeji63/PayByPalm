# Pi 4 camera ring: 12 WS2812B LEDs

This is the optional local LED integration for the Chromium kiosk. It does not
run in customers' phones or grant access to biometric/payment services. Deploy
the updated wallet and backend, then install the updated Pi files on the kiosk.
No new Supabase migration is required for the LED feature.

## Wiring (power off before connecting)

Identify terminals using the **PCB labels**, not wire colours.

| Ring terminal | Connection |
| --- | --- |
| DIN | BCM **GPIO18**, physical **pin 12**, through a **330–470 Ω** series resistor |
| GND | LED power-supply ground **and** Pi ground, physical **pin 6** |
| 5V / VCC | External regulated **5 V** supply, sized for at least **720 mA**; a suitable 1 A supply provides margin |
| DOUT | Leave disconnected |

Do not power the ring from a GPIO signal pin. Never connect 5 V to GPIO18 or any
other Pi signal pin. The Pi and LED supply must share ground. A 74AHCT125 or an
equivalent suitable 3.3-to-5 V logic shifter is recommended; the prototype may
use direct GPIO18 data, but 3.3 V signalling into a 5 V ring is not guaranteed.
With a shifter, place the series resistor in the data path to DIN. Check the
shifter's pinout and power connections separately before connecting it.

PWM uses GPIO18/channel 0, 800 kHz, DMA 10, non-inverted. Onboard PWM audio must
not compete with the LED driver. On current Raspberry Pi OS, edit
`/boot/firmware/config.txt` (older images use `/boot/config.txt`) and change the
onboard audio setting to `dtparam=audio=off`. The library also documents disabling
`snd_bcm2835`: put `blacklist snd_bcm2835` in
`/etc/modprobe.d/paybypalm-led-audio.conf`, then reboot. This changes the onboard
PWM audio configuration; do not change unrelated camera/display settings.
See the [driver's PWM/audio limitations](https://github.com/jgarff/rpi_ws281x).

## Install on the Pi

On a fresh Pi, complete [the base kiosk setup](README.md), including registering
its unique terminal credential, first. LED installation does not provision a key.
Use the same non-root account that logs into the Pi desktop. First copy/pull the
updated repository to `~/PayByPalm`. From a terminal in that desktop:

```bash
sudo apt update
sudo apt install -y chromium python3 python3-venv python3-dev build-essential util-linux curl
cd ~/PayByPalm
systemctl --user stop paybypalm-kiosk
sudo bash pi/install-leds.sh --user "$(id -un)"
bash pi/install.sh
```

The optional installer:

- Installs `rpi-ws281x==5.0.0` in a root-owned `/opt/paybypalm-led/venv`.
- Installs root-owned controller/host/test files under `/opt/paybypalm-led/`.
- Registers a Chromium native-messaging host in
  `/etc/chromium/native-messaging-hosts/org.paybypalm.led.json`, restricted to the
  kiosk extension's stable ID.
- Grants the selected desktop user passwordless sudo for **only** the fixed
  isolated Python LED-host command. It does not grant arbitrary Python/shell
  execution. The browser remains an unprivileged desktop process.
- Creates `~/.config/paybypalm/led-enabled`, opting that kiosk into the bridge.
  The normal installer refreshes the kiosk extension assets. Existing device
  credentials and payment recovery data are preserved; do not reprovision a key.

The marker uses the standard desktop config location. If you deliberately run the
kiosk with a custom `XDG_CONFIG_HOME`, place `led-enabled` alongside its existing
`paybypalm/terminal.env` instead. Do not copy the terminal key into LED settings.

Test the ring **before restarting Chromium**, so only one PWM owner exists:

```bash
sudo /opt/paybypalm-led/venv/bin/python3 -I /opt/paybypalm-led/test-leds.py
```

Expected sequence: blue chase → white → off → blue chase → green → off → red →
off. Ctrl+C or SIGTERM clears the ring. Then start the normal kiosk:

```bash
~/.local/share/paybypalm/pi/start-kiosk-session.sh
journalctl --user -u paybypalm-kiosk -f
```

The existing desktop autostart launches Chromium after login/reboot. Chromium
starts the LED host on its first LED event; no separate root web service or LED
systemd unit is needed. Do **not** run Chromium with sudo or `--no-sandbox`.
The narrow sudo rule is for the browser bridge, not the diagnostic script; the
standalone diagnostic command may request your normal administrator password.

## Brightness, direction and camera exposure

Edit the root-owned settings with `sudoedit /etc/paybypalm/led.json`:

```json
{
  "brightness": 70,
  "capture_brightness": 50,
  "clockwise": true,
  "step_seconds": 0.1
}
```

`capture_brightness` is an independent 0–255 brightness setting. Start at 40–60
and examine actual camera frames for clipping, reflections and lost skin
texture. Do not stack this with another brightness multiplier. Set `clockwise`
to false to reverse the chase (LED 0 → 11 → 10...). Apparent clockwise direction
also depends on how the ring is mounted. Restart the kiosk after changing settings.

White also illuminates the ready-camera positioning preview, so automatic hand
detection does not depend on an unlit palm. The preview renews the white watchdog
every five seconds while active, including while the hand model loads or is
unavailable. It stops renewing during acquisition/processing and on navigation.
Exposure settles for **300 ms after the white frame is acknowledged by Python**,
before the existing three-frame camera burst. This is adjustable as
`TIMINGS.ledExposureSettleMs` in `wallet/src/terminal/config.ts`; rebuild/deploy
the frontend after changing it. White is steady throughout the burst, then an
acknowledged OFF precedes blue processing. Image ranking and backend biometric
registration follow acquisition; the image format/API payload is unchanged.

## State mapping

| Actual application event | Ring |
| --- | --- |
| Terminal identity/session loading, camera startup, backend processing or card-charge confirmation | Blue chase, one bright pixel, approximately 0.1 s per step |
| Ready-camera hand positioning and enrollment/payment capture burst | All 12 steady white, capture brightness |
| Backend returns completed enrollment after binding, profile and session writes | All 12 green, approximately 2 s, then off |
| Camera failure, rejected palm, enrollment failure or backend error | All 12 red, approximately 2 s; a ready camera then returns to white for retry |
| Verified payment receipt | Green feedback; an uncertain charge never displays success |
| Idle / waiting for phone QR claim / normal navigation cleanup | Off |

The existing touchscreen text remains the source of instructions/errors. Rejected
palm outcomes now show the backend message after cancellation of the unpaid sale.
LEDs do not establish biometric identity, approve a charge, or replace backend
checks. Partial/failed final enrollment writes return an error instead of a false
completed response. Backend failure recovery still needs inspection of its saved
records; this change does not add automatic registration rollback/retries.

One worker initializes and writes the hardware. State changes wake it immediately;
there are no per-animation threads or blocking animation sleeps in the UI. A
process lock prevents a standalone test/second host from driving PWM concurrently.
Green/red timers are replaced when a new operation starts. White times out after
10 s, loading after 90 s as a fallback, rather than keeping the ring lit if a
page/operation disappears. Normal capture is much shorter than that limit.
Tab navigation/close and native-messaging EOF clear the ring; SIGINT/SIGTERM/
SIGHUP attempt cleanup. An abrupt power loss/SIGKILL cannot execute software
cleanup; the next controller startup clears the ring. Never assume the last LED
colour proves the financial outcome after an interruption.

If hardware fails, the terminal reports a camera-light warning during capture and
can still use ambient light; all normal backend checks remain in effect. Restart
the kiosk after correcting wiring, power, audio conflicts or permissions. Hardware
errors never get interpreted as a successful enrollment or payment.

## Bridge boundary

The existing extension injects the device key only on its configured `/terminal`
origin/path. With the LED marker present, a second isolated content script passes
only five enumerated states through an extension worker to the Python host using
[Chromium native messaging](https://developer.chrome.com/docs/extensions/develop/concepts/native-messaging).
There is no TCP listener, public hardware API, CORS exception, image transfer,
account ID, terminal key, or payment token in the LED protocol. The background
validates the originating extension, top-level tab, origin and path, bounds pending
requests, and limits traffic. The native host bounds message size and rejects
extra fields/commands. Desktop account administrators can control the ring; this
is not a boundary against someone who controls the kiosk account or root.

To disable LED integration while keeping the terminal:

```bash
systemctl --user stop paybypalm-kiosk
rm ~/.config/paybypalm/led-enabled
~/.local/share/paybypalm/pi/start-kiosk-session.sh
```

For a complete hardware uninstall also remove the specific
`/etc/sudoers.d/paybypalm-led-YOUR_USERNAME` rule, native-host manifest and
`/opt/paybypalm-led` installation using your administrator account. Do not delete
terminal credentials or payment history.

## Development and verification

On a laptop with no LEDs, explicit mock testing requires only Python:

```bash
python3 pi/test-leds.py --mock
python3 -m unittest discover -s pi/tests -v
bash -n pi/install.sh pi/install-leds.sh pi/paybypalm-kiosk.sh
cd wallet
pnpm test:security
```

On non-Pi machines the controller uses a mock driver automatically. Unit tests
inject a recording strip; they cover direction, steady white, feedback expiry,
watchdogs, interruptions, hardware failure, shutdown, bounded native messages and
concurrent rapid state changes. The normal kiosk is unchanged unless opted in.

Optional browser tests (Playwright/Chromium required):

```bash
node pi/tests/browser-bootstrap.mjs
node pi/tests/browser-leds.mjs
```

The second test runs the actual extension → native Python protocol with a mock
strip and Chromium's synthetic camera. It verifies steady white across all three
camera frames, off/blue before saving, no green before completion, red on save
failure, feedback expiry, navigation cleanup and route isolation. This is **not**
a physical GPIO, electrical, camera-exposure or real-palm validation.

On the Pi, verify the standalone colours, then successful and failed enrollment,
identification failure, camera denial/disconnection, reload/close, repeated rapid
attempts and a full boot cycle. Inspect captured images at brightness 40/50/60 and
calibrate exposure/position under the kiosk's actual lighting. Physical colour,
signal reliability without a level shifter and biometric image quality cannot be
confirmed on a development computer.

## Changed code

- `pi/led_controller.py`: five states, one writer, brightness/direction, timers,
  mock/hardware drivers and PWM ownership lock.
- `pi/led_host.py`, `led-content.js`, `led-background.js`,
  `led-extension-key.txt`: bounded native bridge and stable extension identity.
- `pi/install-leds.sh`, `test-leds.py`: optional privileged hardware installation
  and standalone four-state check.
- `pi/prepare-kiosk.py`, `install.sh`: opt-in bridge assets in the existing kiosk.
- `wallet/src/terminal/leds.ts`, `config.ts`, `useCamera.ts`: scoped LED events,
  acknowledged capture light and exposure settling around the existing burst.
- `wallet/src/terminal/screens/Capture.tsx`, `screens/Enrol.tsx`, `TerminalApp.tsx`:
  actual initialization, recognition, enrollment, result and error events.
- `backend/src/services/enrolService.ts`: reject a failed final session write.
- Pi, wallet and backend tests cover the new paths; wallet's security test command
  includes the LED sequence tests. No account/card-payment schema was changed.
