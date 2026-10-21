import { createClient } from "@supabase/supabase-js";
import { centralAuth } from "./identity.js";
import { createApp } from "./app.js";
import { readConfig } from "./config.js";

/** Shared initialization for the local listener and Vercel's request handler. */
export function configuredApp(serveFrontend = true) {
  const config = readConfig();
  const options = {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  };
  const db = createClient(
    config.SUPABASE_URL,
    config.SUPABASE_SERVICE_ROLE_KEY,
    options,
  );
  const auth = () =>
    centralAuth(config.PAYMENT_API_BASE_URL);
  return { config, app: createApp({ config, db, auth, serveFrontend }) };
}
