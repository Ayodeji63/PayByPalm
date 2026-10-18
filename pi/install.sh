#!/usr/bin/env bash
# Run as the desktop user, never with sudo.
set -euo pipefail
if [[ $EUID -eq 0 ]]; then echo 'Run this installer as the kiosk desktop user, without sudo.' >&2; exit 1; fi
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
DEST="$HOME/.local/share/paybypalm/pi"
install -d -m 0700 "$DEST" "${XDG_CONFIG_HOME:-$HOME/.config}/paybypalm"
install -m 0755 "$SCRIPT_DIR/paybypalm-kiosk.sh" "$SCRIPT_DIR/start-kiosk-session.sh" "$DEST/"
install -m 0600 "$SCRIPT_DIR/led-content.js" "$SCRIPT_DIR/led-background.js" "$SCRIPT_DIR/led-extension-key.txt" "$DEST/"
install -m 0600 "$SCRIPT_DIR/kiosk_config.py" "$SCRIPT_DIR/prepare-kiosk.py" "$SCRIPT_DIR/provision-terminal.py" "$DEST/"
install -d "${XDG_CONFIG_HOME:-$HOME/.config}/systemd/user" "${XDG_CONFIG_HOME:-$HOME/.config}/autostart"
install -m 0644 "$SCRIPT_DIR/paybypalm-kiosk.service" "${XDG_CONFIG_HOME:-$HOME/.config}/systemd/user/"
# Use a quoted absolute path: desktop Exec does not expand $HOME or ~.
python3 - "$DEST/start-kiosk-session.sh" "${XDG_CONFIG_HOME:-$HOME/.config}/autostart/paybypalm-kiosk.desktop" <<'PY'
import sys
path = sys.argv[1].replace('\\', '\\\\').replace('"', '\\"').replace('`', '\\`').replace('$', '\\$').replace('%', '%%')
with open(sys.argv[2], 'w') as f:
    f.write('[Desktop Entry]\nType=Application\nName=PayByPalm kiosk\nExec="' + path + '"\nTerminal=false\n')
PY
systemctl --user daemon-reload
printf '%s\n' 'Installed for this desktop user. Configure the device, then enable desktop auto-login.' \
  'Start now from the Pi desktop: ~/.local/share/paybypalm/pi/start-kiosk-session.sh' \
  'Logs: journalctl --user -u paybypalm-kiosk -f'
