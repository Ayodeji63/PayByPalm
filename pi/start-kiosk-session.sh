#!/usr/bin/env bash
set -euo pipefail
# Invoked by XDG autostart inside the real desktop session.
SESSION_VARIABLES=()
for name in DISPLAY WAYLAND_DISPLAY XAUTHORITY XDG_SESSION_TYPE XDG_CURRENT_DESKTOP; do
  if [[ -v "$name" ]]; then SESSION_VARIABLES+=("$name"); fi
done
if ((${#SESSION_VARIABLES[@]})); then
  systemctl --user import-environment "${SESSION_VARIABLES[@]}"
fi
exec systemctl --user restart paybypalm-kiosk.service
