/**
 * Supabase clients.
 *
 * Two clients, two very different privilege levels — keeping them distinct is the
 * point of this module.
 *
 * `db` holds the service role key. It bypasses row-level security entirely and is
 * the only thing in this system that can write to the database. It must never be
 * handed to a client, echoed in a response, or logged.
 *
 * `authClient` holds the anon key and is used only to exchange credentials with
 * Supabase Auth and to verify user JWTs. It is subject to RLS like any browser.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { config } from '../config.js';

/** Service-role client. Bypasses RLS. Backend only, always. */
export const db: SupabaseClient = createClient(
  config.SUPABASE_URL,
  config.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: {
      // A server has no browser session to persist or refresh, and doing so would
      // let one request's identity leak into another's.
      persistSession: false,
      autoRefreshToken: false,
    },
  },
);

/** Anon-key client, for login/signup and JWT verification. Subject to RLS. */
export const authClient: SupabaseClient = createClient(
  config.SUPABASE_URL,
  config.SUPABASE_ANON_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } },
);
