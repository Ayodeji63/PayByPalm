# PayByPalm

Biometric payment for a closed-loop campus wallet. A student links their palm **once**, at a
terminal, via a QR handshake with their phone. After that they pay at any terminal with their
palm alone — no phone, no card, no PIN, no QR.

Built for Wema Bank Hackaholics 7.0.

```
supabase/     Postgres schema, double-entry ledger, RLS, seed, tests
backend/      Node + TypeScript + Express API              → Render
wallet/       React + Vite + Tailwind app                  → Vercel
              /  /login  /dashboard  /scan   customer wallet
              /terminal                      merchant kiosk (800x480)
pi/           Kiosk launcher, systemd unit, camera setup   → Raspberry Pi
```

## The five rules the code is built around

**1. The palm provider key never leaves the backend.** `TENCENT_PALM_API_KEY` is read in exactly
one file, `backend/src/palm/tencent.ts`. The Pi posts an image to us; we call Tencent. Enforced
mechanically by `wallet: pnpm guard:secrets`, which greps the built bundle and fails on a hit.

**2. Tencent is a pure matching oracle.** The only thing it ever receives is our Supabase user id
and an image. No name, no phone number, no balance.

**3. There is no balance column.** Anywhere. Balance is derived by summing `ledger_entries`, and
a deferred constraint trigger makes an unbalanced transaction impossible to commit.

**4. Every biometric call is audited.** A decorator wraps the provider, so success *and* failure
both write a `palm_audit` row with the provider's request id, score, latency, and error code.
There is no way to reach the provider around it.

**5. Nothing is debited without an explicit Confirm tap.** Palm authentication identifies a
person and writes zero ledger entries. One route moves money: `POST /transactions/:id/confirm`.

## Getting it running

```bash
# 1. Database — see supabase/README.md for the three ways to apply these
#    Apply migrations/0001…0009 in order, then seed.sql

# 2. Backend
cd backend && pnpm install
cp .env.example .env          # fill in Supabase keys
pnpm seed                     # 5 users, ₦20,000 each; prints logins + terminal key
pnpm dev

# 3. Wallet
cd ../wallet && pnpm install
cp .env.example .env          # point VITE_API_BASE_URL at the API
pnpm dev
```

**You do not need Tencent access to run any of this.** `PALM_PROVIDER=mock` is the default and
the whole application works end to end on it — enrol a palm, pay with a palm, watch the money
move. Switching to the real service is one environment variable.

## Verifying

```bash
./supabase/tests/run.sh     # 14 schema invariants against a throwaway Postgres (Docker only)
cd backend && pnpm test     # 50 unit tests, no network, no database
cd wallet && pnpm build && pnpm guard:secrets
```

The schema tests are the ones worth reading. They prove money cannot be created, destroyed, or
double-spent: a replayed confirm raises `PB002` and charges nothing, an overdraw raises `PB003`
and writes no entries, an unbalanced write is rejected, and a client key can read nothing but
its own rows.

## What is built, and what is not

**Built:** the database, the API, the wallet app, and the merchant terminal — end to end.

The terminal is a route in the same React app (`/terminal`), running full-screen in Chromium
kiosk mode on a Pi with a 7" 800x480 panel. Launch flags, the systemd unit, screen-blanking,
and camera setup are in [`pi/README.md`](pi/README.md).

**The remaining risk is hardware, not code.** Real cameras and real lighting are where
biometric demos die. Get the Pi camera visible to Chromium as a V4L2 device early — that one
step is unrelated to any application code and is the most likely thing to cost you the demo.

## Two honest caveats

**The match thresholds are not calibrated.** `PALM_ACCEPT_SCORE=85` and `PALM_STEP_UP_SCORE=70`
are a starting point, not measured values. Every call is logged to `palm_audit` with its score —
tune from that data, collected on the actual Pi camera under the actual kiosk lighting. A
threshold chosen by intuition is the most likely cause of a failed live demo.

**There is no liveness detection.** The three PalmAI endpoints available offer no anti-spoof
signal, so a photograph of a palm may match. Out of scope for a 48-hour build — but say it
plainly in the demo rather than letting a judge discover it.

## Funding

`POST /topup` credits a wallet from a system float account. **No real money moves**, and the
wallet app labels it as sandbox. It is the seam where a real rail plugs in: an inbound Wema NIP
or virtual-account webhook would verify that money actually arrived and call the same
`post_topup()` function. The ledger shape does not change.

---

The wallet app uses a neutral placeholder wordmark and never renders Wema Bank's name, logo, or
trademarks.
# PayByPalm
