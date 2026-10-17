# Raspberry Pi terminal: automatic startup

The Pi runs Chromium at the deployed wallet's `/terminal` route. The backend runs
on Render (or another reachable server), not on the Pi. The Pi holds its own device
key only: never a Supabase service-role key, Tencent key, or customer login.

## Before installing

- Use Raspberry Pi OS **with Desktop**, a working network, touchscreen and a camera
  Chromium can access. Run setup as the account that logs into the Pi desktop.
- Deploy the updated wallet/backend and apply the pending Supabase migrations
  through `0013`. Configure the backend's real Tencent provider for live matching.
- The frontend's build must use the reachable HTTPS API URL in `VITE_API_BASE_URL`.
  `localhost:8080` would point at the Pi itself. Backend `WALLET_BASE_URL` must be
  the public wallet URL so phones can open enrolment QR links.
- Use a dedicated kiosk account/browser profile. Do not sign customer wallets into it.

## 1. Install on the Pi

Copy this updated `pi/` folder onto the Pi (or pull the repository once these
changes have been committed and pushed). In a terminal on the Pi desktop:

```bash
sudo apt update
sudo apt install -y chromium python3 util-linux curl
cd ~/PayByPalm/pi

# Retire the former system-wide unit if you installed it previously.
sudo systemctl disable --now paybypalm-kiosk.service 2>/dev/null || true

# Run as the desktop user, WITHOUT sudo.
bash install.sh
```

The installer copies the launcher/helpers into `~/.local/share/paybypalm/pi/`,
creates a **user** systemd service, and adds an XDG desktop autostart entry. It
uses the actual Wayland or X11 session environment. No hardcoded `pi`/`ayo` user,
DISPLAY or XAUTHORITY path is required. Running the installer again updates files
without replacing the device key or clearing payment recovery/browser data.

## 2. Generate and register one device key

In Supabase SQL Editor, find the merchant this terminal belongs to:

```sql
select id, name from public.merchants order by name;
```

On the Pi, substitute that merchant ID below:

```bash
python3 ~/.local/share/paybypalm/pi/provision-terminal.py \
  --url https://pay-by-palm.vercel.app/terminal \
  --merchant-id YOUR_MERCHANT_UUID \
  --label 'Main counter'
```

Use your actual deployed wallet URL if different. The script saves a fresh random
key in `~/.config/paybypalm/terminal.env`, owned by the desktop user with mode 0600.
It prints an `INSERT` statement containing **only the SHA-256 hash**. Run that
statement once in your intended Supabase project's SQL Editor. It registers the
terminal and associates it with the merchant. Do not run the old demo seed to
provision a device. The published development credential is no longer accepted.

Provisioning refuses to overwrite an existing config: normal restarts must retain
the registered key. To rotate deliberately, stop the service, move the config to
a private backup, generate/register a new key, revoke the old terminal credential
in Supabase, and restart. Preserve terminal records referenced by payment history;
do not delete financial history. Reconcile pending sales before rotation.

Never put the key in Git, chat, a Vite variable or a `?k=` URL. The device file,
generated extension and browser profile are private credentials; protect the Pi's
account and disk. A user who controls the kiosk account can retrieve its key.

## 3. Start now, then enable automatic boot

From the Pi's logged-in desktop:

```bash
~/.local/share/paybypalm/pi/start-kiosk-session.sh
journalctl --user -u paybypalm-kiosk -f
```

The terminal should display its merchant name. Check camera capture and complete a
test enrolment/payment in staging before live acceptance.

Enable **Desktop Auto Login** using `sudo raspi-config` under the boot/auto-login
settings. Disable screen blanking in the Pi's display settings. Then reboot:

```bash
sudo reboot
```

The startup sequence is:

1. Pi boots and logs into its desktop account.
2. Desktop autostart imports that session's display variables into the user service.
3. The service creates a private temporary Chromium extension under `XDG_RUNTIME_DIR`.
4. The launcher waits for the wallet site to be reachable, then Chromium opens the clean HTTPS `/terminal` URL using a dedicated browser profile.
5. At document start, the extension sets `sessionStorage['paybypalm.terminalKey']`
   for that terminal origin before the app's scripts run.
6. The app authenticates with `X-Terminal-Key`; systemd restarts Chromium if it exits.

The reusable key is absent from browser arguments and URLs. The generated extension
has no web-accessible files, background worker or message endpoint; its content
script only injects on the configured origin's `/terminal` path and subpaths.
Use **Chromium**: branded Google Chrome removed support for this command-line
extension-loading workflow. No debug port or disabled browser security is needed.

The temporary extension is removed when the launcher exits. The dedicated profile
is retained. Payment recovery in sessionStorage survives ordinary reloads in the
same tab, but **must not be assumed to survive a power cut or browser restart**.
After an interrupted payment, reconcile outstanding server transactions before
starting new sales; automatic browser startup is not financial reconciliation.

## Daily operation

- **Enrol new user:** show QR, let the signed-in customer claim it on their phone,
  then capture their palm on the terminal.
- **New sale:** enter amount, capture palm (optionally narrow with phone last four
  digits), confirm, and enter the customer's wallet PIN if the backend requires it.
- A scan alone does not debit money. Successful backend confirmation settles it.
- An unknown payment outcome displays recovery. Retry/check that same sale; do not
  clear browser storage or reset the terminal to get around it.
- Signup/PIN setup happens on customers' phones, not on the kiosk.
- Real funding rails are still pending. Live sandbox top-ups are disabled.

## Maintenance and troubleshooting

```bash
systemctl --user status paybypalm-kiosk
systemctl --user restart paybypalm-kiosk
systemctl --user stop paybypalm-kiosk
journalctl --user -u paybypalm-kiosk -n 100 --no-pager
curl https://YOUR-API.onrender.com/health
```

| Symptom | Check |
|---|---|
| No kiosk after reboot | Desktop auto-login enabled for the user who ran install.sh; user autostart entry exists |
| Service reports no graphical session | Start through `start-kiosk-session.sh` from the desktop, not from an unconfigured SSH session |
| Config rejected | Desktop-user ownership and mode 0600; HTTPS URL ends exactly `/terminal`; unique random key |
| Terminal not configured | Chromium extension loaded; use Chromium, correct URL, installed helpers and generated config |
| Terminal not registered | Printed SQL applied to the backend's Supabase project; matching device hash/merchant |
| API connection refused | Frontend API URL points at a reachable server, not localhost on the Pi |
| API returns abuse_protection_unavailable | Apply migration 0012; verify database credentials and schema cache |
| Camera unavailable | Camera visible to Chromium, secure HTTPS origin, supported hardware/driver |
| Matches fail | Real Tencent configuration, enrolled palm, fixed camera position and lighting; thresholds need hardware calibration |

For SSH management, run commands as the same desktop user. To stop automatic launch,
remove `~/.config/autostart/paybypalm-kiosk.desktop` and stop the user service.

## Verification

```bash
python3 -m unittest discover -s pi/tests -v
bash -n pi/paybypalm-kiosk.sh pi/install.sh pi/start-kiosk-session.sh
```

Optional real Chromium bootstrap test (requires Playwright available to Node):

```bash
node pi/tests/browser-bootstrap.mjs
```

This checks that the key exists before the first application script, reload works,
and fresh unrelated-route tabs do not receive it. Hardware camera, display,
desktop auto-login and power-cycle behavior must still be verified on the Pi.

References: [Chromium extension loading](https://groups.google.com/a/chromium.org/g/chromium-extensions/c/1-g8EFx2BBY/m/S0ET5wPjCAAJ),
[content-script timing](https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts),
[Raspberry Pi configuration](https://www.raspberrypi.com/documentation/computers/configuration.html).


Implemented locally. The launcher now provisions the key without URL exposure, waits for connectivity, and restarts Chromium if it exits. Six tests and a real Chromium bootstrap check passed. **It hasn’t been installed on your Pi yet.**

On the Pi:

1. Copy the updated repository onto it, then run these commands **as the desktop user**:

   ```bash
   sudo apt update
   sudo apt install -y chromium python3 util-linux curl

   cd ~/PayByPalm/pi
   sudo systemctl disable --now paybypalm-kiosk.service 2>/dev/null || true
   bash install.sh
   ```

2. Find your merchant ID in Supabase SQL Editor:

   ```sql
   select id, name from public.merchants;
   ```

3. Generate the device credential, replacing the merchant UUID and wallet URL:

   ```bash
   python3 ~/.local/share/paybypalm/pi/provision-terminal.py \
     --url https://pay-by-palm.vercel.app/terminal \
     --merchant-id YOUR_MERCHANT_UUID \
     --label 'Main counter'
   ```

   **Run the SQL statement it prints in Supabase.** The actual key stays privately on the Pi; the statement contains only its hash.

4. Start the terminal from the Pi desktop:

   ```bash
   ~/.local/share/paybypalm/pi/start-kiosk-session.sh
   ```

5. Run `sudo raspi-config`, enable **Desktop Auto Login**, then reboot. The desktop will automatically start the kiosk service. [Raspberry Pi configuration](https://www.raspberrypi.com/documentation/computers/configuration.html).

To inspect problems:

```bash
journalctl --user -u paybypalm-kiosk -f
```

The updated backend/wallet and Supabase migrations must also be deployed. The frontend’s API URL must point to your reachable backend—not `localhost` on the Pi.

Full installation, camera checks, and interrupted-payment recovery guidance: [Pi setup guide](/home/dell/PayByPalm/pi/README.md).