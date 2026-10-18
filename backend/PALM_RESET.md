# Palm unlink and onboarding reset

The dashboard and Profile both show an explicit **Palm linked / Palm not linked**
panel based on the authenticated account's enrollment state. The dashboard's
header no longer always claims the palm is active. **Unlink palm** asks for
confirmation, calls the authenticated `/palm/revoke` API and refreshes the account.
Fresh enrollment goes through biometric consent again. Palm management is the
first section of Profile, and the dashboard palm shortcut opens Profile. The
unlink control remains available even when the local enrollment flag is false,
so a customer can remove a retained provider registration.

## Deletion contract

1. Tencent deletes both directions with `PalmDirectionList: [1, 2]`.
2. A read-only `get_palm` check must confirm absence (empty/zero palm records or
   documented `2080009`). A failed, malformed or inconclusive check fails cleanup.
3. Claimed/captured enrollment sessions expire, local `palm_bindings` rows are
   deleted, and `profiles.palm_enrolled` becomes false. Any failed database write
   returns an error; retry repeats the idempotent provider deletion and cleanup.
4. The frontend shows removal success only after the backend confirms completion.

Provider cleanup is attempted even when the local profile flag is false, covering
partially completed earlier removals. Account-authentication middleware limits
the dashboard action to that account. Non-biometric audit metadata remains for
deletion receipts and history; it is not an active palm binding.

## Reset completed on 18 October 2026

The user confirmed that the local backend key matched Render's PayPalm key.
A read-only provider check first found an active right palm for the one known
enrolled account. The explicit administrator cleanup then completed:

- Tencent deletion request: `d86142406d49440184cdf4f879640375`.
- Verification request: `7c166e2869cf7f29d90aa7f1cf6ecb79`, `2080009` (data not found).
- Remaining database palm binding rows: **0**.
- Profiles with `palm_enrolled=true`: **0**.
- Active claimed/captured enrollment sessions: **0**.

The cleanup enumerated all binding rows, registration-audit user IDs and enrolled
profile flags. One distinct account was found and removed, with zero failures.
Tencent's documented API does not list all gallery users, so unknown orphaned
registrations whose IDs were erased in earlier resets cannot be enumerated or
certified absent. Those require an old database export or Tencent's administrator.
No payment/identification flow change is part of this reset.

## Deploy and start again

Deploy the updated backend and wallet. No schema migration or Pi reinstall is
required for this change. The database/provider reset above has already run;
the UI/backend code still needs deployment. Then:

1. Open the wallet dashboard; expect **Palm not linked**.
2. Select **Link palm** and complete consent.
3. Create a fresh enrollment QR session on the terminal and claim it in the wallet.
4. Capture the palm; wait for confirmed enrollment and **Palm linked** in the wallet.

The earlier `2080023` search/application error remains a separate provider issue;
this reset alone does not establish that 1:N search is healthy.

## Repeat reset on 18 October 2026, 06:47 UTC

The user explicitly requested another reset using a supplied credential. That
credential differed from the local backend credential; it was supplied to the
cleanup child process only and was not saved in the repository or `.env`.

- Scope: one distinct account enumerated from bindings, enrollment flags and
  registration audit history in `atypombnwskmhfqblnbr.supabase.co`.
- Tencent deletion acknowledgement: `0def314b8d0423cddf789f66263423e8`.
- Follow-up GetPalm: `9ee5fc6a17368d8d7a9f6e515a6ae3c6`, `2080009` (data not found).
- Cleanup: one account completed, zero failures.
- Independent database checks: zero binding rows, zero enrolled profiles and
  zero claimed/captured enrollment sessions.

Unknown registrations whose user IDs are absent from this database remain
outside what can be enumerated with the documented API. This does not certify
an application-wide gallery wipe. The exposed credential should be rotated,
with the replacement configured privately in Render and the local backend.

The deployed wallet's 16 referenced JavaScript bundles were inspected before
the UI fix. None contained the unlink control or `/palm/revoke` request. The
wallet must be deployed before the new Profile control appears on the live site.

## Regression checks

Backend tests cover both-direction deletion, verification failure, retries after
partial local cleanup, and no local success after provider failure. Wallet tests
and `wallet/tests/palm-status-browser.mjs` cover linked/unlinked display, failure,
confirmed removal, account refresh and fresh consent on mobile and desktop.
The browser fixture uses fake API responses and never deletes real registrations.
