# PayByPalm — Database

Postgres schema for a closed-loop campus wallet with palm-biometric payment.

## The three rules this schema enforces

**1. There is no balance column.** Nowhere. A balance is derived by summing
`ledger_entries` through the `account_balances` view. Money moves only as balanced
debit/credit pairs, and a `DEFERRABLE INITIALLY DEFERRED` constraint trigger makes an
unbalanced transaction impossible to commit — not merely unlikely.

**2. All amounts are `bigint` minor units (kobo).** Never float, never `numeric`.
₦1,250 is `125000`.

**3. Clients cannot write.** RLS is on for every table and there is not a single
`INSERT`, `UPDATE`, or `DELETE` policy in the schema. Reads are scoped to the calling
user's own rows. Every write goes through the backend's service role key, which must
never reach a browser, a phone, or the Pi.

## Files

| File | Contents |
|---|---|
| `migrations/0001_extensions.sql` | pgcrypto |
| `migrations/0002_profiles.sql` | `profiles`, generated `phone_last4` |
| `migrations/0003_accounts.sql` | `accounts`, `merchants`, `terminals`, `handle_new_user()` |
| `migrations/0004_palm.sql` | `palm_bindings`, `palm_audit` |
| `migrations/0005_ledger.sql` | `transactions`, `ledger_entries`, `account_balances`, balance trigger |
| `migrations/0006_enrol.sql` | `enrol_sessions` |
| `migrations/0007_functions.sql` | `post_transaction()`, `post_topup()`, `balance_of()` |
| `migrations/0008_rls.sql` | RLS policies, function grants, realtime publication |
| `migrations/0009_indexes.sql` | lookup indexes |
| `seed.sql` | float account, one merchant, one terminal |
| `tests/run.sh` | full verification against a throwaway Postgres |

Apply migrations in filename order. They are not individually idempotent — run them
once against a fresh project. `seed.sql` **is** safe to re-run.

## Applying

### Option A — Supabase SQL Editor (no tooling required)

Paste the contents of each file into the SQL Editor and run them **in order**:
`0001` → `0009`, then `seed.sql`.

### Option B — Supabase CLI

No global install needed:

```bash
npx supabase link --project-ref <your-project-ref>
npx supabase db push
```

### Option C — direct psql

```bash
export DATABASE_URL='postgresql://postgres:[PASSWORD]@db.[REF].supabase.co:5432/postgres'
for f in supabase/migrations/*.sql; do psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$f"; done
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/seed.sql
```

## Seeding users

`seed.sql` covers only the rows that need no auth user. The five test users need
`auth.users` rows, which SQL cannot create properly — Supabase hashes passwords and
issues identities through its Admin API. Insert them with the Admin API and the
`handle_new_user` trigger creates each profile and wallet automatically:

```bash
cd backend && pnpm seed
```

That script creates 5 users, credits each ₦20,000 via `post_topup()`, and prints
their login credentials.

**Signup must pass `full_name` and `phone` as user metadata.** `handle_new_user()`
raises if either is missing, rather than creating a half-formed profile:

```ts
await supabase.auth.admin.createUser({
  email, password, email_confirm: true,
  user_metadata: { full_name: 'Ada Ade', phone: '08010001234' },
})
```

## Verifying

```bash
./supabase/tests/run.sh
```

Requires Docker and nothing else — no Supabase CLI, no local psql, no network access
to your project. It spins up Postgres 17, applies every migration from scratch, checks
`seed.sql` is idempotent, runs 14 invariant tests, and destroys the container.

The tests cover:

| | |
|---|---|
| T1–T2 | `handle_new_user` provisions profile + wallet; signup without metadata is rejected |
| T3 | `post_topup` writes a balanced pair; the float account carries the offsetting debit |
| T4 | a payment settles as a balanced pair and both balances derive correctly |
| T5 | replaying confirm raises `PB002` and charges nothing |
| T6–T7 | overdrawing raises `PB003` and writes no ledger entries |
| T8 | an unbalanced write is rejected by the deferred trigger |
| T9–T10 | one float account only; `kind` and `user_id` cannot disagree |
| T11 | enrolment is one-time, and revoke → re-enrol works |
| T12–T13 | RLS isolates users; `account_balances` does not leak other accounts |
| T14 | a client key cannot insert ledger entries or call `post_topup` |

`tests/local_supabase_stub.sql` fakes `auth.users`, `auth.uid()`, and the
anon/authenticated/service_role roles so the migrations can run on a bare Postgres.
It is a test fixture and is never applied to a real project.

## Error codes

`post_transaction()` and `post_topup()` raise custom SQLSTATEs, which PostgREST
surfaces verbatim as `error.code`. Map these to HTTP statuses; never string-match on
messages.

| Code | Meaning | Suggested HTTP |
|---|---|---|
| `PB001` | transaction not found | 404 |
| `PB002` | wrong status for this operation (includes replays) | 409 |
| `PB003` | insufficient funds | 402 |
| `PB004` | a required account is missing | 500 |
| `PB005` | transaction has no matched user | 409 |

## Notes on specific decisions

**`palm_bindings` uses a partial unique index**, `unique (user_id) where revoked_at is null`,
not a plain `unique (user_id)`. Revocation is soft, so a plain constraint would let a user
revoke but never re-enrol — the revoked row would permanently occupy their only slot.

**`account_balances` is declared `security_invoker = true`** (Postgres 15+). Without it a
view runs as its owner, and any authenticated client could read every account's balance
straight through the RLS policies on the underlying tables.

**`post_transaction()` locks `accounts`, not `ledger_entries`.** The rows that would need
excluding do not exist yet, so there is nothing in the ledger to lock against. Locking the
account row is what stops two concurrent payments from both seeing a sufficient balance.

**`profiles.phone_last4` is a generated column.** Maintained by application code it would
eventually drift from `phone` after a number change and silently break the terminal's
candidate lookup.

**`palm_audit.user_id` is deliberately not a foreign key.** Audit rows must outlive the user
they describe; a cascade delete would erase the dispute evidence along with the account.

**The float account is expected to go negative.** Its debit balance is the correct
double-entry representation of money issued into the closed loop.

## Where a real funding rail plugs in

`post_topup()` is the hackathon stand-in for money entering the closed loop. In production
an inbound Wema NIP / virtual-account webhook would verify the credit and call this same
function. The ledger shape does not change.
