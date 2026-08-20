# PayByPalm — Raspberry Pi terminal

Chromium kiosk on a 7" 800x480 touchscreen with a Pi camera. The terminal is a route in
the wallet app (`/terminal`), not a separate deployment — one build serves both.

## What the terminal holds, and what it does not

It holds **one** credential: `X-Terminal-Key`, which identifies the device and its merchant.

It holds **no Tencent key** and **no Supabase service key**. The Pi posts a palm image to our
backend and the backend calls the palm provider. There is no code path from this device to
Tencent, and a stolen terminal cannot read anyone's data — only create charges against its own
merchant, which is revocable in one SQL statement.

### Why the key is not a build variable

The obvious approach is a `VITE_TERMINAL_KEY` baked in at build time. That would be a real
leak: the wallet and the terminal are **one bundle on one public origin**, so anything inlined
at build time is readable by any customer who opens devtools on the wallet. A terminal key can
create charges.

So the key lives in `/etc/paybypalm/terminal.env` on the Pi. The launcher appends it to the
URL once at boot; the page moves it into `localStorage` and calls `history.replaceState` to
strip it from the address bar.

The honest tradeoff: it transits as a query parameter once per boot and can appear in edge
access logs. Rotate by editing the env file and updating `terminals.api_key_hash`. That beats
publishing it to every wallet user.

`pnpm guard:secrets` in the wallet fails the build if a `pbp_*` key ever appears in `dist`.

## Install

```bash
# 1. Dependencies
sudo apt update
sudo apt install -y chromium-browser unclutter x11-xserver-utils

# 2. Device key
sudo install -d -m 0755 /etc/paybypalm
sudo cp terminal.env.example /etc/paybypalm/terminal.env
sudo chmod 0600 /etc/paybypalm/terminal.env
sudo nano /etc/paybypalm/terminal.env     # set KIOSK_URL and TERMINAL_KEY

# 3. Launcher
sudo install -m 0755 paybypalm-kiosk.sh /usr/local/bin/paybypalm-kiosk.sh

# 4. Autostart
sudo cp paybypalm-kiosk.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now paybypalm-kiosk
```

```bash
journalctl -u paybypalm-kiosk -f     # logs
sudo systemctl restart paybypalm-kiosk
```

## Chromium flags that actually matter

| Flag | Why |
|---|---|
| `--kiosk` | Full screen, no browser chrome, no way out |
| `--app=<url>` | No tab strip, no omnibox |
| `--use-fake-ui-for-media-stream` | **Auto-grants the camera.** The permission prompt is unclickable in kiosk mode, so without this `getUserMedia` never resolves and the terminal is dead |
| `--autoplay-policy=no-user-gesture-required` | Lets the preview `<video>` start without a tap |
| `--disable-session-crashed-bubble`, `--noerrdialogs`, `--disable-infobars` | After a power cut the Pi comes back to the terminal, not to a "restore pages?" bar over the UI |
| `--check-for-update-interval=31536000` | Stops an update check stealing the foreground mid-sale |
| `--disk-cache-dir=/tmp/...` | Keeps cache writes off the SD card |
| `--window-size=800,480` | Matches the panel exactly |

Deliberately **not** used: `--disable-web-security` and `--unsafely-treat-insecure-origin-as-secure`.
`getUserMedia` needs a secure context and the app is served over HTTPS, so the usual kiosk
camera workarounds are unnecessary. If you must test against a plain-HTTP dev server, forward
it to `localhost` over SSH (`ssh -L 8080:localhost:8080 pi@...`) — localhost counts as secure —
rather than weakening the browser on a device that handles payments.

## Stopping the screen from blanking

Three separate mechanisms, and you need all three — they are three different things, and
missing one means the screen goes dark partway through a demo. The launcher runs them, but set
them persistently too:

```bash
# X session — add to ~/.config/lxsession/LXDE-pi/autostart
@xset s off
@xset s noblank
@xset -dpms
```

```bash
# Console blanking (fires before X on some images)
sudo raspi-config          # Display Options → Screen Blanking → No
```

```bash
# Belt and braces on Bookworm, if the above is not honoured:
# /boot/firmware/cmdline.txt — append to the single existing line
consoleblank=0
```

On Raspberry Pi OS Bookworm with Wayland/labwc, `xset` is a no-op. Either switch to X11 via
`raspi-config` → Advanced Options → Wayland → X11 (simplest, and what these scripts assume),
or use `wlopm --on '*'` and disable the compositor's idle timeout instead.

## Camera

The app requests `facingMode: environment` at `1280x720`. Check the camera is visible to the
browser as a V4L2 device:

```bash
libcamera-hello --list-cameras     # is the module detected at all?
ls /dev/video*                     # is there a V4L2 node?
v4l2-ctl --list-devices
```

Modern Pi OS exposes the CSI camera through `libcamera`. Chromium wants V4L2, so if
`/dev/video0` is absent, load the compatibility bridge:

```bash
sudo modprobe bcm2835-v4l2
echo bcm2835-v4l2 | sudo tee -a /etc/modules   # persist across reboots
```

**Do this early in the build, not at hour 40.** "The camera is not visible to Chromium" is the
single most likely thing to cost you a demo, and it is unrelated to any of the application code.

### Mount the camera so the framing never changes

The app draws a fixed hand outline and the customer aligns to it. The same outline is used at
enrolment and at payment, on purpose: a template enrolled at one distance and matched at
another is what makes scores drift. Fix the camera rigidly relative to the palm position and
do not adjust it between enrolling your demo users and demoing payment.

## Tuning the match thresholds

`PALM_ACCEPT_SCORE=85` and `PALM_STEP_UP_SCORE=70` on the backend are **starting points, not
measured values**. Every call is logged to `palm_audit` with its score. Enrol a few people on
the real hardware under the real lighting, run a few dozen payments, then:

```sql
select endpoint, is_match, count(*), round(avg(score)) as avg_score,
       min(score), max(score)
from palm_audit
where created_at > now() - interval '1 day'
group by 1, 2 order by 1;
```

Set the accept threshold below the genuine-match cluster and above the impostor cluster. A
threshold picked by intuition is the most likely cause of a failed live demo.

## Demo reset

**Long-press the merchant name on the idle screen for ~1 second.** This clears the current
transaction and returns to idle. It is deliberately hidden rather than a visible button — a
"reset" control on a till is something a customer will eventually press.

## Troubleshooting

| Symptom | Cause |
|---|---|
| "Terminal not configured" | No key in `localStorage`. Relaunch with `?k=...`, i.e. restart the service |
| "Camera unavailable — no camera detected" | No `/dev/video*`; see the `bcm2835-v4l2` step above |
| "Camera unavailable — access is blocked" | `--use-fake-ui-for-media-stream` missing from the launch flags |
| Red "Offline" banner | The Pi cannot reach the API. Check DNS and `curl $API/health` |
| Screen goes dark mid-demo | One of the three blanking mechanisms is still active |
| Comes back to "restore pages?" after a power cut | `--disable-session-crashed-bubble` missing |
| Every match scores low | Camera moved between enrolment and payment, or focus is off |
