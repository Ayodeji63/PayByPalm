#!/usr/bin/env bash
#
# Launch Chromium in kiosk mode for the PayByPalm terminal.
#
# The device key is read from /etc/paybypalm/terminal.env and appended to the
# URL exactly once, at launch. The page immediately moves it into localStorage
# and strips it from the address bar, so it is not left sitting in the URL for
# the rest of the session.

set -euo pipefail

ENV_FILE=/etc/paybypalm/terminal.env
[ -r "$ENV_FILE" ] || { echo "Missing $ENV_FILE" >&2; exit 1; }
# shellcheck disable=SC1090
. "$ENV_FILE"

: "${KIOSK_URL:?KIOSK_URL not set}"
: "${TERMINAL_KEY:?TERMINAL_KEY not set}"

export DISPLAY=:0

# --- Keep the panel awake -------------------------------------------------
# Three separate mechanisms, because they are three separate things: the X
# screensaver, DPMS power management, and the console blanker. Missing any one
# of them means the terminal goes dark partway through a demo.
xset s off          # no screensaver
xset s noblank      # do not blank the screen
xset -dpms          # no display power management

# Hide the pointer. There is no mouse, and a stray arrow on a kiosk looks broken.
unclutter -idle 0 -root &

# --- Chromium -------------------------------------------------------------
# Flags that matter, and why:
#
#   --kiosk                          full screen, no chrome, no exit affordance
#   --app=<url>                      no tab strip or omnibox
#   --use-fake-ui-for-media-stream   auto-grants the camera permission. The
#                                    prompt is unclickable in kiosk mode, so
#                                    without this getUserMedia never resolves.
#   --autoplay-policy=...            lets the <video> preview start without a
#                                    user gesture
#   --noerrdialogs
#   --disable-session-crashed-bubble after a power cut the Pi must come back to
#   --disable-infobars               the terminal, not to a "restore pages?" bar
#   --disable-features=Translate...  no translate bar over the UI
#   --check-for-update-interval      stop update checks stealing the foreground
#   --window-size=800,480            match the panel exactly
#   --disk-cache-dir=/tmp/...        keep writes off the SD card
#
# NOTE: no --disable-web-security and no --unsafely-treat-insecure-origin.
# getUserMedia needs a secure context, and the app is served over HTTPS, so the
# usual kiosk workarounds for camera access are not needed here. If you are
# testing against a plain-HTTP dev server, use an SSH tunnel to localhost
# rather than weakening the browser.

exec chromium-browser \
  --kiosk \
  --app="${KIOSK_URL}?k=${TERMINAL_KEY}" \
  --user-data-dir=/home/pi/.config/paybypalm-kiosk \
  --disk-cache-dir=/tmp/paybypalm-cache \
  --use-fake-ui-for-media-stream \
  --autoplay-policy=no-user-gesture-required \
  --noerrdialogs \
  --disable-infobars \
  --disable-session-crashed-bubble \
  --disable-features=TranslateUI,Translate \
  --disable-pinch \
  --overscroll-history-navigation=0 \
  --check-for-update-interval=31536000 \
  --window-size=800,480 \
  --window-position=0,0
