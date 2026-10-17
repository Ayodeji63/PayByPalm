# Pass 1 remediation and release requirements

The wallet no longer falls back to demo authentication. Registration now uses real Supabase email verification; see
[`backend/EMAIL_SETUP.md`](../backend/EMAIL_SETUP.md) for required hosted setup. PIN changes and biometric app unlock remain
unavailable until enforcement exists. Existing phone-only accounts require migration to a verified real email.

Private responses and refresh results are discarded after logout or an account
change. Local card caches are scoped by the server-returned user ID and cleared
when leaving that account. Unowned legacy card caches and plaintext PIN storage
are discarded; users may need to add their cards again. These caches are not a
substitute for server-side card ownership enforcement.

## Deployment actions

1. Apply `supabase/migrations/0010_revoke_dev_terminal.sql`. This replaces the
   published development key hash with a disabled marker and preserves historical
   terminal references. Confirm that the old key fails against `/terminal/me`.
2. Provision each terminal with a fresh, independently generated credential and
   register its SHA-256 hash using the trusted server/admin provisioning process.
   Install the updated Pi launcher using [`pi/README.md`](../pi/README.md); it
   provisions the key locally without `?k=` URLs.
   The browser client now reads `sessionStorage['paybypalm.terminalKey']`; a trusted
   device-local bootstrap must set that value for the terminal origin in the same
   tab before app mounting. Never set it through a Vite variable or a navigation
   URL. Prefer a device-local agent that retains the credential outside the browser.
   Isolate terminal and wallet browser profiles; ideally use separate origins.
3. Rotate any credentials formerly passed in URLs and inspect retained hosting
   logs. Removing the URL parameter in JavaScript cannot undo existing log copies.
4. Disable hosted Phone Auth, enable confirmed email signup, configure production
   SMTP and the six-digit signup confirmation email template. Follow `backend/EMAIL_SETUP.md`.
5. Apply migration `0016_restore_full_signup.sql` and deploy backend and wallet together.
   No session is issued until the email code is verified.
6. Review the existing backend PIN-change handler and its attempt limits, then
   connect the UI to its server confirmation before restoring PIN changes. Implement real app unlock
   before restoring that setting. Neither feature currently claims success.
7. Verify backend JWT validation, user/device ownership checks, and server logout
   revocation. Local logout now invalidates pending client work but does not revoke
   previously copied tokens. HttpOnly cookie sessions require backend changes and
   CSRF protection; access/refresh tokens currently remain in localStorage.

Production Supabase grants and RLS policies must be checked independently of the
local fixtures. No production migration or configuration update was executed.

## Verification

Run `npm run typecheck`, `npm run test:security`, and `npm run build` from `wallet/`.
The regression suite covers stale private responses, refresh completion after
account switching, rejected refreshed tokens, legacy demo sessions, account cache
isolation, and terminal credential bootstrap.

## P2 payments

See `backend/SECURITY_PAYMENTS.md` for payment migration and rollout requirements.
Transfers, card linking/charging, and simulated merchant reports are disabled.
Wallet funds come from the server ledger. Terminal payment retries retain their
original sale reference and reconcile unknown outcomes before another sale.
