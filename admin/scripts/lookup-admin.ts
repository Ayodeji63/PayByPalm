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
let found = false;
for (let page = 1; page <= 100; page++) {
  const r = await db.auth.admin.listUsers({ page, perPage: 100 });
  if (r.error) throw new Error("Could not query Supabase Auth.");
  const user = r.data.users.find((u) => u.email?.toLowerCase() === email);
  if (user) {
    if (!user.email_confirmed_at)
      throw new Error(
        "This account must verify its email before admin access.",
      );
    console.log(`Verified account UUID: ${user.id}`);
    found = true;
    break;
  }
  if (r.data.users.length < 100) break;
}
if (!found) {
  console.error("No verified matching account was found.");
  process.exitCode = 1;
}
