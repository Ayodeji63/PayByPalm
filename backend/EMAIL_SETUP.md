# Signup with an email confirmation link

Signup collects full name, phone, email and password. Supabase sends a standard
confirmation link. After clicking it, the user returns to `/auth/confirm`; the API
validates the confirmed identity, then the wallet requires PIN setup if needed.
Returning users continue signing in with email and password. No email code entry
or passwordless sign-in is required. Phone is a self-reported lookup hint only.

## Hosted Supabase settings you must apply

Local files do not update a hosted Supabase project's Auth settings.

1. Enable Email signup and **Confirm email**. Keep Phone Auth disabled.
2. Under Authentication → URL Configuration, set **Site URL** to your wallet's
   public HTTPS origin. Add the exact URL `https://YOUR-WALLET-HOST/auth/confirm`
   to **Redirect URLs**. For local development add
   `http://localhost:5173/auth/confirm` (or the matching 127.0.0.1 URL).
   Set backend `WALLET_BASE_URL` to the same wallet origin. The API chooses the
   redirect; it never accepts an arbitrary URL from the browser.
3. Under Email Templates → **Confirm signup**, restore Supabase's default link
   template, whose anchor uses `href="{{ .ConfirmationURL }}"`. If the project
   previously used our code template, replace it. The repository's
   `supabase/templates/confirmation.html` is a compatible link template for local
   development or projects that allow customization. Do not paste `{{ .Token }}`.
   New free projects created from June 3, 2026 using the built-in sender cannot
   customize templates; their default link template already works.
4. For public users, configure custom SMTP with a verified sender. Supabase's
   built-in sender is for testing, currently limited to two emails/hour/project
   and recipients on your Supabase organization team. Link verification does not
   bypass delivery limits. Custom SMTP is available on Supabase Free; the external
   provider has its own limits and costs. Keep SMTP credentials in Supabase,
   never in the wallet or chat.
5. Deploy backend and wallet together, then restart the backend. Request a new
   confirmation email: previously sent code emails cannot become links.

No hosted settings or deployments were applied by this code change.
There is no new database migration for the link flow. If migrations are pending,
apply them in order, including `0016_restore_full_signup.sql` if the earlier
passwordless migration was applied; do not reset the database or erase users.

## API and session handling

- `POST /auth/signup`: `{fullName,phone,email,password}` returns
  `{email,verificationRequired:true}` without an unverified session.
- `POST /auth/resend-confirmation`: `{email}` resends a signup link, with cooldowns.
- The default Supabase confirmation link verifies the email at Supabase, then
  redirects with an implicit-flow session in the URL fragment. `/auth/confirm`
  removes the fragment from browser history and sends only its refresh token in
  an HTTPS POST body to `POST /auth/confirm`. The API rotates it, fetches the
  authoritative Auth identity, and requires a confirmed real email and matching
  user ID before returning session credentials. No credentials go in API URLs.
- Invalid/expired links show recovery instructions. If the email is already
  confirmed, the user can sign in with their password. Confirmation works in a
  different browser/device without storing a signup password in the original tab.
- `/auth/verify-otp` and `/auth/send-otp` are retired. There is no password rewrite
  or PIN overwrite during confirmation. Existing accounts with a PIN go directly
  to their dashboard; new accounts must choose/confirm a wallet PIN.

Signup budgets: production 60/hour/IP and 5/hour/email; development 300/hour/IP
and 30/hour/email. Supabase's email-delivery limits apply separately.

## Verify delivery and redirects

For local Supabase, open Mailpit (`supabase status` reports its address; normally
http://127.0.0.1:54324). Create an account, open its email, click the confirmation
link and verify it returns to the wallet's PIN setup. Try an expired link, resend,
a new browser/device, a confirmed account login and an existing account with a PIN.
For hosted testing use an organization-team email with the built-in sender, or a
normal customer address after SMTP is configured. Check Auth logs if delivery
fails. Do not disable confirmation to work around SMTP errors.

References:
- https://supabase.com/docs/guides/auth/passwords
- https://supabase.com/docs/guides/auth/sessions/implicit-flow
- https://supabase.com/docs/guides/auth/auth-smtp
- https://supabase.com/changelog/46599-changes-to-email-template-customisation-on-free-tier

## Signup returns AuthRetryableFetchError / HTTP 500

An upstream HTTP 500 is not proof of an SMTP failure. Current auth-js versions
wrap server errors in `AuthRetryableFetchError` and may omit their structured
error code. The API logs a fixed `authFailureCategory` alongside `authStatus`:
`email_delivery`, `signup_database`, `network`, `rate_limit`, `upstream_service`
or `unknown`. These are diagnostic hints, not definitive root causes. Raw
provider messages, addresses and credentials are intentionally excluded.

In Supabase Dashboard → Logs → Auth, inspect the failed `/signup` entry at the
request time. If it says "Error sending confirmation email", inspect SMTP and
email-provider logs. If it says "Database error saving new user", inspect the
Postgres error and `public.handle_new_user()` trigger, required profile fields,
constraints and pending migrations. Health/settings returning 200 only establish
service availability; they do not exercise signup, email sending or the trigger.
Do not reset users, disable confirmation or rerun unrelated migrations based only
on the generic 500. The actual Auth/Postgres log determines the repair.

### Confirmed `profiles_phone_key` duplicate during signup

If Auth logs report SQLSTATE 23505 for `profiles_phone_key`, the hosted schema
still enforces the old phone-unique identity rule. Migration 0014 removes it.
Run `supabase/repairs/restore_email_phone_constraint.sql` in the hosted SQL Editor
for the narrow, repeatable repair. It removes only that stale constraint and
preserves all existing users, profiles, wallet IDs, balances and PINs. Then retry
signup once. Do not delete the older account or merge wallets by phone. Apply
other pending migrations in order separately; this repair does not apply them.
