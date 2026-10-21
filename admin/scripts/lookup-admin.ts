import { createClient } from "@supabase/supabase-js";
import { readConfig } from "../server/config.js";
const c = readConfig(),
  email = process.argv[2]?.toLowerCase();
if (!email) {
  console.error("Usage: npm run admin:lookup -- verified-email@example.com");
  process.exit(1);
}
const db = createClient(c.SUPABASE_URL, c.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const result = await db.rpc('lookup_verified_identity', { p_email: email });
if (result.error) throw new Error('Identity lookup is unavailable. Apply authentication migration 0025.');
if (result.data?.length !== 1) { console.error('No verified matching account was found.'); process.exitCode=1; }
else console.log(`Verified account UUID: ${result.data[0].id}`);
