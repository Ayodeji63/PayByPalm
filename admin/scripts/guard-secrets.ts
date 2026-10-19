import "dotenv/config";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
const names = [
  "SUPABASE_SERVICE_ROLE_KEY",
  "SUPABASE_ANON_KEY",
  "SESSION_ENCRYPTION_KEY",
  "PAYSTACK_SECRET_KEY",
  "PAYSTACK_TEST_SECRET_KEY",
  "PAYSTACK_LIVE_SECRET_KEY",
];
function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((file) => {
    const p = path.join(dir, file);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}
let failed = false;
for (const file of walk("dist")) {
  const text = readFileSync(file, "utf8");
  for (const name of names) {
    const value = process.env[name];
    if (value && value.length > 16 && text.includes(value)) {
      console.error(`FAIL: ${name} appears in ${file}`);
      failed = true;
    }
  }
}
if (!failed)
  console.log(
    "PASS: private Supabase, Paystack and session encryption settings are absent from the browser build.",
  );
process.exitCode = failed ? 1 : 0;
