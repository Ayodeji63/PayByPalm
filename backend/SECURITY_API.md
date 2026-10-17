# P3 API remediation

## Implemented

- Request logging and no-store response headers are initialized before CORS and
  parsing. Disallowed Origins return JSON 403; malformed JSON returns 400;
  oversized bodies return 413; compressed bodies return 415.
- Normal JSON bodies are limited to 16 KiB. The two image routes authenticate and
  consume terminal budgets before parsing. Their encoded-image bounds are derived
  from MAX_IMAGE_BYTES, which must be between 1 byte and 8 MiB (default 2 MiB).
- Phone inputs are bounded to 32 characters, passwords to 200, refresh tokens to
  4096, and transaction-history offsets to 100000.
- PostgreSQL-backed budgets apply across workers. Stored keys are SHA-256 hashes;
  rejected requests are briefly cached locally to reduce repeated database work.
  Protection fails closed if its database RPC is unavailable.
- PIN changes and payment step-up share one five-attempt/15-minute budget per
  payer, across IPs, terminals, and transaction IDs. These budgets count attempts,
  including successful attempts; they do not revoke accounts or sessions.
- Terminal receipts expose only transaction-specific fields and never read or
  return the customer's current balance.
- Error responses hide internal 5xx, provider, and signup diagnostics. Parser
  logging omits raw bodies and diagnostic messages. Request IDs remain available.
- SSE streams use shared leases: at most two per terminal and one per session on
  that terminal. Streams last at most 90 seconds, poll sequentially, pause on
  backpressure, and abort outstanding database requests on disconnect/expiry.
  Worker-crash leases expire after 120 seconds.

## Default budgets

Requests proceeding beyond CORS have an IP budget of 300 requests/minute.
CORS preflight responses and rejected Origins do not consume that database budget. Additional budgets:

| Operation | Identity | Limit |
|---|---|---|
| Signup | IP | 60/hour (300/hour in development) |
| Signup | normalized email | 5/hour (30/hour in development) |
| Login | IP | 20/5 minutes |
| Login | normalized email | 10/15 minutes |
| Email code resend cooldown | normalized email | 1/minute |
| Code verification | IP / email | 20 / 5 per 15 minutes |
| Refresh | IP / token | 60 / 20 per 5 minutes |
| Wallet PIN attempts | payer account | 5/15 minutes |
| User reads | user account | 240/minute |
| Terminal reads | terminal | 120/minute |
| Payment creation/confirmation/cancellation | terminal, separate budgets | 60/minute each |
| Confirmation attempts | terminal + transaction | 5/minute |
| Palm authentication | terminal | 30/minute |
| Enrollment creation/stream opening | terminal, separate budgets | 10/minute each |
| Palm registration | terminal | 6/minute |
| Enrollment claims / disputes | user, separate budgets | 10/minute each |
| Palm revoke | user | 3/5 minutes |
| Health | IP | 60/minute |

Excess requests receive 429 and Retry-After. Clients should honor that delay.

## Deployment actions

1. Apply supabase/migrations/0012_api_abuse_limits.sql before deploying the new
   backend. It creates the shared budgets, protected stream leases, and RPC grants.
   Also apply any pending P1/P2 migrations in filename order. Without the new RPC,
   the API rejects requests rather than running without abuse protection.
2. Verify proxy topology. TRUST_PROXY_HOPS defaults to 0, so forwarding headers
   cannot change a direct client's budget. Render's manifest explicitly uses 1.
   Use 1 only if the backend is reachable exclusively through one trusted proxy
   that appends the actual client address. Verify this with deployed requests;
   do not enable it on a directly exposed server.
3. Keep edge connection/body-size protections enabled: application budgets do
   not prevent network-level flooding or slow connections before Express runs.
   Monitor rate-limit rejections, budget RPC availability, and stream counts.
4. Ensure private responses remain no-store through hosting/proxy layers.

No production configuration or database was changed. The prior out-of-scope
hosted email provider/SMTP setup (see `EMAIL_SETUP.md`) and terminal enrollment-ownership notes remain pending;
this change addresses the six P3 findings and does not resolve those notes.

## Verification

Backend regression tests exercise real local HTTP routes with mocked providers,
body limits, CORS, error sanitization, PIN budgets, response field allowlists,
proxy spoof resistance, and SSE lifecycle/backpressure. The isolated Postgres
suite checks RPC permissions, budget reset/atomicity, and stream limits across
concurrent clients. No external provider is contacted by these tests.
