# Terminal sale creation repair

The hosted database check found both `transactions.sale_id` and
`create_terminal_transaction` missing. This prevents a sale from being created;
the old terminal UI hid the error behind its unknown-payment recovery message.

## Apply the database repair

1. Open the intended Supabase project, then **SQL Editor → New query**.
2. Paste the entire contents of
   `supabase/migrations/0019_terminal_sale_recovery.sql` and select **Run**.
3. Expect success. The migration is safe to rerun and does not delete data.
   It requires the existing verified-card and direct-card migrations 0017/0018.
   It restores the sale column, unique index, creation RPC and current card
   transition trigger. It does not restore internal-wallet debits.
4. Deploy the updated backend and wallet, then restart the Pi kiosk:

   ```bash
   ~/.local/share/paybypalm/pi/start-kiosk-session.sh
   ```

On the recovery screen, choose **Check or retry this payment** to reuse the
saved sale reference and proceed to the camera. Alternatively, **Cancel pending
sale** now recovers a missing transaction ID using that same reference before
cancelling an unpaid sale. Neither operation forgets an uncertain charge.
Do not clear browser payment storage to bypass recovery.

If another error occurs, the updated screen displays the API error and support
request reference. Check Render logs for that reference. A missing database
setup now has the explicit error code `payment_setup_required`.

## Camera illumination

With the optional Pi LED bridge installed, a ready camera now requests steady
white immediately, including while hand recognition is loading or unavailable.
The five-second heartbeat keeps the watchdog active during positioning. Capture
retains white, processing uses blue and navigation clears the ring. This frontend
change needs a wallet deployment; no new Pi scripts or device key are required.

## Validation

`python3 supabase/tests/terminal_sale_recovery_test.py` uses disposable PostgreSQL
to check fresh and interrupted installations, reruns, stable sale references,
card payment invariants and the prohibition on internal-ledger debits. Backend
and wallet regression tests exercise the public configuration error, lost-response
cancellation, preservation of uncertain payments and camera illumination while
the hand model loads/fails. Physical Pi lighting must be checked on the device.
