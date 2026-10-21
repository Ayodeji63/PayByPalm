import { createClient } from "@supabase/supabase-js";
import { readConfig } from "../server/config.js";
const c = readConfig(),
  db = createClient(c.SUPABASE_URL, c.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
let failed = false;
for (const [table, columns] of [
  [
    "merchants",
    "id,contact_email,contact_phone,address,paystack_subaccount,updated_at",
  ],
  ["terminals", "id,disabled_at,updated_at"],
  ["admin_audit", "id,actor_id,action,entity_id,merchant_id,label,created_at"],
  ["admin_sessions", "id,user_id,expires_at,revoked_at"],
] as const) {
  const r = await db.from(table).select(columns).limit(1);
  console.log(
    `${r.error ? "FAIL" : "PASS"}: ${table}${r.error ? " — apply db/0020_admin_onboarding.sql" : " schema accessible"}`,
  );
  failed ||= !!r.error;
}
// Null actors fail at the first guard, before locks, inserts, updates or audits.
for (const [name, args] of [
  [
    "admin_save_merchant",
    {
      p_actor: null,
      p_id: null,
      p_name: "",
      p_email: null,
      p_phone: null,
      p_address: null,
      p_subaccount: null,
      p_expected: null,
    },
  ],
  [
    "admin_save_terminal",
    {
      p_actor: null,
      p_id: null,
      p_merchant: null,
      p_label: null,
      p_hash: null,
      p_action: "create",
      p_expected: null,
    },
  ],
] as const) {
  const r = await db.rpc(name, args);
  const ok = r.error?.code === "PA400";
  console.log(`${ok ? "PASS" : "FAIL"}: ${name} guarded RPC available`);
  failed ||= !ok;
}
for (const id of c.ADMIN_USER_IDS) {
  const r = await db.rpc('lookup_verified_identity', {p_id:id});
  const ok = r.data?.length === 1 && !r.error;
  console.log(
    `${ok ? "PASS" : "FAIL"}: configured administrator exists with verified email`,
  );
  failed ||= !ok;
}
console.log(
  "No merchants, device keys, payments or palm registrations were created or changed.",
);
process.exitCode = failed ? 1 : 0;
