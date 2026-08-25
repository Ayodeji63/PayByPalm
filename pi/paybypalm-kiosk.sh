#!/usr/bin/env bash

set -euo pipefail

ENV_FILE=/etc/paybypalm/terminal.env

if [[ ! -r "$ENV_FILE" ]]; then
  echo "Missing $ENV_FILE" >&2
  exit 1
fi

# shellcheck disable=SC1090
source "$ENV_FILE"

: "${KIOSK_URL:?KIOSK_URL is not set}"
: "${TERMINAL_KEY:?TERMINAL_KEY is not set}"

exec /usr/bin/chromium \
  --kiosk \
  --no-first-run \
  --password-store=basic \
  --user-data-dir=/home/ayo/.config/paybypalm-kiosk \
  --disk-cache-dir=/tmp/paybypalm-cache \
  --use-fake-ui-for-media-stream \
  --test-type \
  --autoplay-policy=no-user-gesture-required \
  --noerrdialogs \
  --disable-session-crashed-bubble \
  --disable-features=TranslateUI,Translate \
  --disable-pinch \
  --overscroll-history-navigation=0 \
  "${KIOSK_URL}?k=${TERMINAL_KEY}"