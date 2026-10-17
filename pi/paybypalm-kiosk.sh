#!/usr/bin/env bash
set -euo pipefail
umask 077

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
: "${XDG_RUNTIME_DIR:?Run as the logged-in desktop user; XDG_RUNTIME_DIR is missing}"
if [[ -z "${DISPLAY:-}" && -z "${WAYLAND_DISPLAY:-}" ]]; then
  echo 'No graphical session. Enable desktop auto-login and start from the desktop session.' >&2
  exit 1
fi

CHROMIUM_BIN="$(command -v chromium || command -v chromium-browser || true)"
if [[ -z "$CHROMIUM_BIN" ]]; then
  echo 'Install Raspberry Pi OS Chromium (not Google Chrome).' >&2
  exit 1
fi

STATE_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/paybypalm/chromium"
CACHE_DIR="${XDG_CACHE_HOME:-$HOME/.cache}/paybypalm/chromium"
mkdir -p -- "$STATE_DIR" "$CACHE_DIR"
# One owner of the browser profile, including launches outside systemd.
exec 9>"$STATE_DIR/kiosk.lock"
flock -n 9 || { echo 'PayByPalm kiosk is already running.' >&2; exit 1; }

EXTENSION_DIR="$(mktemp -d "$XDG_RUNTIME_DIR/paybypalm-kiosk.XXXXXXXX")"
trap 'rm -rf -- "$EXTENSION_DIR"' EXIT
KIOSK_URL="$(python3 "$SCRIPT_DIR/prepare-kiosk.py" --extension-dir "$EXTENSION_DIR")"

# Wait through Wi-Fi startup instead of leaving Chromium on a network-error page.
command -v curl >/dev/null || { echo 'Install curl for the startup connectivity check.' >&2; exit 1; }
until curl --fail --silent --max-time 15 --output /dev/null "$KIOSK_URL"; do
  echo 'Waiting for the wallet site to become reachable...' >&2
  sleep 5
done

# Never include TERMINAL_KEY in arguments, exported variables, URLs or logs.
# Bootstrap runs on the configured origin at document_start before the app mounts.
if [[ "${XDG_SESSION_TYPE:-}" == wayland ]]; then
  PLATFORM_ARGS=(--ozone-platform=wayland)
else
  PLATFORM_ARGS=(--ozone-platform=x11)
  if command -v xset >/dev/null; then
    xset s off || true
    xset s noblank || true
    xset -dpms || true
  fi
fi

"$CHROMIUM_BIN" \
  --kiosk --no-first-run --no-default-browser-check \
  --user-data-dir="$STATE_DIR" --disk-cache-dir="$CACHE_DIR" \
  --disable-extensions-except="$EXTENSION_DIR" --load-extension="$EXTENSION_DIR" \
  --use-fake-ui-for-media-stream --autoplay-policy=no-user-gesture-required \
  --noerrdialogs --disable-session-crashed-bubble --disable-features=TranslateUI,Translate \
  --window-size=800,480 "${PLATFORM_ARGS[@]}" "$KIOSK_URL" &
BROWSER_PID=$!
trap 'kill -TERM "$BROWSER_PID" 2>/dev/null || true' TERM INT
wait "$BROWSER_PID"
