import { createClient } from "@supabase/supabase-js";
import { readConfig } from "../server/config.js";

const config = readConfig();
const db = createClient(config.SUPABASE_URL, config.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
let failed = false;
for (const [table, columns] of [
  ["merchant_memberships", "id,merchant_id,user_id,revoked_at"],
  ["merchant_sessions", "id,user_id,expires_at,revoked_at"],
  [
    "merchant_payment_reports",
    "id,merchant_id,domain,amount_minor,status,reference",
  ],
  ["merchant_payout_setups", "merchant_id,domain,bank_name,account_last4"],
] as const) {
  const result = await db.from(table).select(columns).limit(1);
  console.log(
    `${result.error ? "FAIL" : "PASS"}: ${table} schema ${result.error ? "unavailable — check migrations 0023/0024" : "accessible"}`,
  );
  failed ||= !!result.error;
}
// Null actor is rejected before writes, even if the RPC is present.
const guarded = await db.rpc("admin_grant_merchant_access", {
  p_actor: null,
  p_merchant: null,
  p_email: null,
});
const rpcPresent = guarded.error?.code === "MA400";
console.log(
  `${rpcPresent ? "PASS" : "FAIL"}: guarded merchant access RPC available`,
);
failed ||= !rpcPresent;
try {
  const response = await fetch(
    config.PAYMENT_API_BASE_URL + "/payment-settings",
    { redirect: "error", signal: AbortSignal.timeout(20000) },
  );
  const value = await response.json();
  if (!response.ok || !["test", "live"].includes(value.paymentMode))
    throw Error();
  console.log(
    `PASS: payment backend reachable; reports follow ${value.paymentMode} mode`,
  );
  const protectedRoute = await fetch(
    config.PAYMENT_API_BASE_URL + "/merchant/overview",
    {redirect:"error",signal:AbortSignal.timeout(20000)},
  );
  const reportsDeployed=protectedRoute.status===401;
  console.log(`${reportsDeployed?'PASS':'FAIL'}: merchant report routes ${reportsDeployed?'deployed and reject anonymous access':'unavailable — deploy the updated main backend'}`);
  failed ||= !reportsDeployed;
} catch {
  console.log(
    "FAIL: payment backend settings unavailable; check PAYMENT_API_BASE_URL and its deployment",
  );
  failed = true;
}
console.log(
  "No memberships, sessions, payments, refunds or merchant records were created or changed.",
);
process.exitCode = failed ? 1 : 0;
