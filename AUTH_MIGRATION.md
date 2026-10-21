# Replace Supabase Auth with Better Auth and Resend

This release keeps Supabase PostgreSQL and replaces the account/password/session service with Better Auth 1.7.12. Resend sends verification and password recovery emails. Wallet, administrator and merchant login all use the central backend. Pi device keys and payment authorization are separate and require no reprovisioning.

Existing user UUIDs are copied unchanged. `profiles.id`, palm bindings/Tencent user IDs, encrypted card credentials, transaction ownership, `ADMIN_USER_IDS` and merchant grants retain their relationships. Existing bcrypt passwords are accepted; new passwords use Better Auth's scrypt implementation. Accounts without a usable password can use password recovery after verifying a real email. Phone-only legacy accounts remain disabled until their owner is verified; they are not merged into unrelated email accounts.

## Prepare privately

In `backend/.env` and **Render → backend → Environment**, configure:

| Setting | Value |
| --- | --- |
| `AUTH_DATABASE_URL` | PostgreSQL **Session pooler** URI from Supabase → Connect, with the database password inserted and URL-encoded. Use the same Supabase project as `SUPABASE_URL`. |
| `AUTH_SECRET` | Run `cd backend && pnpm auth:prepare`; copy the generated value from your private `.env` to Render. Preserve it across deploys. |
| `AUTH_BASE_URL` | `https://paybypalm-backend.onrender.com` (or the backend's actual HTTPS origin). |
| `WALLET_BASE_URL` | `https://www.paybypalm.app` (the origin used by confirmation/recovery links). |
| `RESEND_API_KEY` | Resend API key with email-sending permission. |
| `RESEND_FROM_EMAIL` | Bare address on your verified Resend domain, such as `auth@paybypalm.app`. |

The backend includes Supabase's public production root certificate for official Supabase database hosts, while retaining normal hostname and certificate validation. No extra TLS setting is needed for the Session pooler. The certificate source is the [official Supabase Dashboard configuration](https://github.com/supabase/supabase/blob/master/apps/studio/hooks/custom-content/custom-content.json).

If preflight reports PostgreSQL `28P01`, check the **database password** in the connection URI. This is separate from Supabase API keys and your Supabase dashboard login password. Percent-encode reserved characters in the password; leave the host, username and port from the Connect panel intact.

Keep `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, payment and palm settings. `SUPABASE_ANON_KEY` is no longer used by runtime authentication. Do not replace `CARD_TOKEN_ENCRYPTION_KEY`.

Admin and merchant need their existing `PAYMENT_API_BASE_URL` pointing at this backend. They do not need Resend keys, the auth signing secret, or the PostgreSQL password. Existing administrator UUID allowlists and merchant memberships remain in effect.

## Coordinated cutover

Migration **0025 is a cutover**, not an independent feature migration. Prepare all four releases and settings before running it. Pause new signups/payments during the short cutover so users do not see mixed deployments.

1. Ensure a current Supabase backup is available. Build the backend, wallet, admin and merchant from this same commit. Configure the backend's new environment values before releasing it.
2. In Supabase SQL Editor, run the complete `supabase/migrations/0025_resend_auth.sql`. It requires the existing migrations through 0024. Canonical copies of the historical admin migrations 0020/0023 now also live in `supabase/migrations/`, so a fresh install applies them in the correct order. The migration is transactional and rerunnable: failure rolls it back; rerunning preserves changed passwords and newly created identities.
3. Release the backend and all three frontend apps together. The old authentication release must not continue serving signups after this migration.
4. In Supabase Authentication settings, disable new Email and Phone signups/providers for the retired Auth service. Disable any retired auth email hook or custom SMTP integration there. Resend settings now belong on the PayByPalm backend.
5. Run `cd backend && pnpm auth:preflight`. This performs read-only checks and prints counts only. Sign in with an existing verified account, then test a fresh signup, verification, logout and password recovery using an address you control.
6. Verify admin access and merchant reports, then resume terminal sales. Reload the Pi's terminal page; no device key reset or reinstall is required.

The migration moves application foreign keys to `pbp_auth."user"`, provisions new profiles/accounts atomically, updates merchant access lookup functions, revokes old browser database grants and retires Supabase signup/phone synchronization triggers. Private Better Auth tables are not exposed through PostgREST. Legacy `auth.users` rows are retained for audit; never delete them as part of this cutover. Reapplying older Auth/merchant SQL after 0025 would restore obsolete references; use forward migrations for later changes.

Existing wallet sessions and admin/merchant cookies must sign in again. Old Supabase verification/reset links do not work with the new engine: request a fresh link through PayByPalm. New verification links confirm email only and then ask the user to sign in. Password reset links are single use and revoke prior sessions. Normal refresh extends the same opaque database-backed session; the compatibility API fields `accessToken` and `refreshToken` both carry that session token, not a Supabase JWT.

## Validation

```bash
cd backend
pnpm test
pnpm typecheck
pnpm build
pnpm test:startup
pnpm test:auth:database  # Docker; temporary local PostgreSQL; fake mail only
```

The database test migrates a legacy bcrypt identity, verifies stable UUID/profile/account ownership, tests email confirmation, logout, password recovery and session revocation, repeats the migration, rejects old signups and checks private table permissions. No external emails or card charges are initiated by automated tests.

For the browser test, start the wallet with `pnpm exec vite --host 127.0.0.1 --port 5189`, then run `pnpm test:wallet-auth` in `admin` (Playwright Chromium required). It intercepts every authentication request and sends no emails.

Additional app checks: `pnpm test && pnpm build` in `admin` and `merchant`; `pnpm test:security && pnpm build` in `wallet`.

A rollback requires a deliberate database restoration/forward repair and the matching application release. Deploying the old application alone after 0025 is not a valid rollback: new accounts and password changes belong to the new identity store.

Implementation references: [Better Auth email/password](https://better-auth.com/docs/authentication/email-password), [PostgreSQL adapter](https://better-auth.com/docs/adapters/postgresql), [Bearer plugin](https://better-auth.com/docs/plugins/bearer), [Resend email API](https://resend.com/docs/api-reference/emails/send-email).
