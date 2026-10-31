# Live operations

Sign in as an authorized administrator and open **Live operations** in the sidebar
(`/#/operations`). The feed polls every two seconds between requests and merges
PayByPalm terminal/backend events with authenticated CCNet reader events. You can
pause updates, filter by operation/terminal, inspect request traces, and load earlier
backend events. Raw captures, embeddings, API keys and saved card authorizations
never appear in the feed. An offline/setup warning means tracking is incomplete.

## Rollout

1. Publish the matching backend and wallet release, with migrations **0027, 0028 and 0029**.
   The existing safe release helper (`cd backend` then
   `node --import tsx scripts/release-ccnet.ts`) checks GitHub
   write access before migrating. Only run it with committed, tested changes. All
   migration ledger entries and schema changes are committed atomically. Existing
   Tencent history is preserved; no live card charges are made by this helper.
2. Start the PC's CCNet API and tunnel using `python3 scripts/local.py start` in
   `/home/dell/projects/PalmModels/CCNet`. This also creates a dedicated monitor-only
   credential without changing existing credentials.
3. In CCNet, run `python3 scripts/prepare_monitor.py`. Add the two server environment
   variables from ignored `secrets/paybypalm-admin-monitor.env` to this admin app's
   deployment: `CCNET_BASE_URL` and `CCNET_MONITOR_API_KEY`. Redeploy the admin app.
   Use neither `VITE_` prefixes nor the management/backend API key for monitoring.
4. Update the Pi to the matching wallet build. Its progress events are checked
   against the authenticated terminal's enrollment session or transaction.

For local use, the CCNet command
`python3 scripts/prepare_monitor.py --admin-env /home/dell/PayByPalm/admin/.env`
configures the existing admin server for fast loopback monitoring. Start this app
with `npm run dev` and open `http://127.0.0.1:5190/#/operations`.

The monitor credential is stored privately in CCNet's ignored
`secrets/paybypalm-monitor.key`. The admin server alone uses it to call
`GET /v1/operations`. It cannot enroll, replace, delete, verify or identify palms.
Keep the PC awake and the tunnel connected. One open deployed monitor typically
adds roughly 30 ngrok requests/minute; each monitor key is limited to 60/minute.
Close unused tabs and monitor the free tunnel quota.

## Retake behavior

CCNet enrollment uses **three independent frames** spaced 100 ms apart. All three
pairwise cosine similarities are checked; CCNet averages and normalizes the three
embeddings into one stored template. Photos are transient. The dashboard shows
sample count, pairwise similarity and timing when available. Payment captures a
three-frame burst and sends its sharpest frame for identification.

A definite input rejection offers **Retake** in the same phone-claimed QR session.
An uncertain timeout offers **Retry linking**, which keeps the original capture
fingerprint to avoid overwriting a completed enrollment. Only expired/revoked
sessions require a new QR. A mismatched payment scan likewise retakes against the
same sale and never confirms/charges automatically. Standalone thresholds remain
0.50; payment approval still requires at least 50/100 and a positive
provider result for the highest-ranked eligible palm.

## Scope and retention

The feed includes session creation/claim, capture guidance/progress, enrollment,
verification, identification, unlink/delete, payment/cancellation requests, and
verified card status including reconciliation. Device progress is advisory;
server/provider results establish identity/payment outcomes. A late upstream
response may be shown as Reader API until the backend supplies its request link.
Background payment events can be associated with a terminal using an earlier event
for the same transaction in the loaded view.

Metadata is best effort, with a bounded nonblocking queue; outage/overload drops are
reported in backend logs. Financial records and existing palm audit rows remain
separate. Backend history retains 50,000 records, local reader history about 10,000,
and the browser view at most 1,000. Logging begins with this release. It cannot
reconstruct activity from an older deployed backend or earlier captured images.

If publishing is blocked by GitHub authentication, sign in locally first:

```bash
export PATH="$HOME/.local/bin:$PATH"
gh auth login --web --git-protocol https
gh auth setup-git
cd /home/dell/PayByPalm/backend
node --import tsx scripts/release-ccnet.ts
```

Keep the existing Paystack settings. On Render, import CCNet's private
`secrets/paybypalm-render.env` into the backend and choose **Save, rebuild, and
deploy**. Deploy the matching wallet/Pi and admin versions together. The admin
monitoring file goes in the admin server's environment, not in Render's payment
backend environment. These files are private local artifacts and are never
included in the code commit.


## Reader completion versus terminal authentication

**Search completed** and **Comparison completed** describe a successful reader API
request. These are neutral processing states. They do not approve authentication
or establish that a payment went through. The inspector separately shows the
linked backend's **Palm rejected**, **Palm accepted**, pending or error result,
including the actual score and rejection reason when recorded. A palm acceptance
still requires the customer's Pay tap and provider-confirmed payment.

If only reader events arrive, the inspector says **Decision unavailable** and the
page warns that terminal decisions have not been received. Check the backend release
and its operation-log persistence. A reachable database with no events does not
establish that the deployed backend is emitting telemetry. Historical reader events
cannot reconstruct an unrecorded terminal decision. Correlation uses the reader's
upstream request link and the exact backend request, never a different scan of the
same transaction. The payment threshold and authorization checks are unchanged.

Regression coverage: `tests/operationPresentation.test.ts` and
`tests/operation-outcomes-browser.mjs`, plus backend CCNet-payment and operation-event
unit tests. Browser cases cover missing, rejected and accepted decisions at desktop
and mobile widths using fixture APIs only.


## Checkout threshold 0.50

Apply `supabase/migrations/0029_ccnet_checkout_threshold.sql` after 0027/0028.
It lowers the database authorization/charge floor to 50 while preserving exact
bindings, expiry, card ownership, charge idempotency and recovery. Existing applied
migrations are unchanged. On Render set `PALM_ACCEPT_SCORE=50` and
`PALM_STEP_UP_SCORE=40`, then deploy the matching backend. Private prepared Render
settings include both values. Refresh/redeploy the admin app for the new policy copy.

Checkout requires a positive reader verdict and selects the highest raw cosine
similarity reaching 50/100. Another eligible user above 50 does not reject the winner.
For example, 0.8471 wins over 0.6333. Raw similarity determines rank even when both
integer scores round down to the same value. An exact top similarity tie between
different users asks for a retake. Acceptance never charges until Pay.
