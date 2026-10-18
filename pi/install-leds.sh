#!/usr/bin/env bash
# Optional hardware install. Run: sudo bash pi/install-leds.sh --user <desktop-user>
set -euo pipefail
if [[ $EUID -ne 0 || $# -ne 2 || $1 != --user || ! $2 =~ ^[a-z_][a-z0-9_-]*\$?$ ]]; then
  echo 'Usage: sudo bash pi/install-leds.sh --user <desktop-user>' >&2; exit 1
fi
KIOSK_USER=$2
KIOSK_HOME=$(getent passwd "$KIOSK_USER" | cut -d: -f6)
KIOSK_UID=$(id -u "$KIOSK_USER")
KIOSK_GROUP=$(id -gn "$KIOSK_USER")
[[ $KIOSK_UID -ne 0 && -d $KIOSK_HOME ]] || { echo 'Choose a non-root desktop account.' >&2; exit 1; }
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
DEST=/opt/paybypalm-led
# Privileged Python files and interpreter must never be writable by the kiosk user.
install -d -o root -g root -m 0755 "$DEST" /etc/paybypalm /etc/chromium/native-messaging-hosts
install -o root -g root -m 0644 "$SCRIPT_DIR/led_controller.py" "$SCRIPT_DIR/led_host.py" "$SCRIPT_DIR/test-leds.py" "$DEST/"
python3 -m venv "$DEST/venv"
"$DEST/venv/bin/python3" -I -m pip install --disable-pip-version-check 'rpi-ws281x==5.0.0'
cat > "$DEST/native-host.sh" <<'HOST'
#!/bin/sh
exec /usr/bin/sudo -n /opt/paybypalm-led/venv/bin/python3 -I /opt/paybypalm-led/led_host.py
HOST
chmod 0755 "$DEST/native-host.sh"
chown -R root:root "$DEST"
chmod -R go-w "$DEST"
# No shell, arbitrary Python, extra arguments or user-supplied module paths.
RULE=$(mktemp)
trap 'rm -f "$RULE"' EXIT
printf '%s ALL=(root) NOPASSWD: /opt/paybypalm-led/venv/bin/python3 -I /opt/paybypalm-led/led_host.py\n' "$KIOSK_USER" > "$RULE"
visudo -cf "$RULE"
install -o root -g root -m 0440 "$RULE" "/etc/sudoers.d/paybypalm-led-$KIOSK_USER"
python3 - "$SCRIPT_DIR/led-extension-key.txt" <<'PY'
import base64, hashlib, json, sys
from pathlib import Path
raw=base64.b64decode(Path(sys.argv[1]).read_text().strip(), validate=True)
digest=hashlib.sha256(raw).digest()[:16]
extension_id=''.join(chr(97+(b>>4))+chr(97+(b&15)) for b in digest)
manifest={'name':'org.paybypalm.led','description':'PayByPalm local LED states only',
          'path':'/opt/paybypalm-led/native-host.sh','type':'stdio',
          'allowed_origins':['chrome-extension://'+extension_id+'/']}
Path('/etc/chromium/native-messaging-hosts/org.paybypalm.led.json').write_text(json.dumps(manifest))
settings=Path('/etc/paybypalm/led.json')
if not settings.exists():
    settings.write_text(json.dumps({'brightness':70,'capture_brightness':50,'clockwise':True,'step_seconds':0.1},indent=2)+'\n')
PY
install -d -o "$KIOSK_USER" -g "$KIOSK_GROUP" -m 0700 "$KIOSK_HOME/.config/paybypalm"
install -o "$KIOSK_USER" -g "$KIOSK_GROUP" -m 0600 /dev/null "$KIOSK_HOME/.config/paybypalm/led-enabled"
printf '%s\n' 'LED bridge installed. Run the normal pi/install.sh as the desktop user, then restart the kiosk.' \
 'Settings: /etc/paybypalm/led.json. GPIO18/PWM requires onboard PWM audio disabled; see pi/LEDS.md.'
