/**
 * Test environment.
 *
 * src/config.ts validates the environment at import time and exits the process if
 * it is incomplete. A setup file is imported before the test modules that pull in
 * config, so this is the only place the values can be set early enough.
 *
 * Everything here is syntactically valid and functionally inert — no test in this
 * suite makes a network call, so the Supabase URL and keys are never dialled. The
 * thresholds are pinned rather than inherited from a developer's .env so the
 * policy tests assert against known boundaries.
 */

const TEST_ENV: Record<string, string> = {
  NODE_ENV: 'test',
  SUPABASE_URL: 'https://test.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'test-service-role-key',
  SUPABASE_ANON_KEY: 'test-anon-key',
  WALLET_BASE_URL: 'http://localhost:5173',
  PALM_PROVIDER: 'mock',
  PALM_ACCEPT_SCORE: '85',
  PALM_STEP_UP_SCORE: '70',
  MAX_CANDIDATES: '4',
  MOCK_PALM_SCORE: '92',
  MAX_IMAGE_BYTES: '2097152',
  ENROL_SESSION_TTL_SECONDS: '90',
  AUTH_VALIDITY_SECONDS: '60',
  LOG_LEVEL: 'fatal',
};

for (const [key, value] of Object.entries(TEST_ENV)) {
  // Assign unconditionally: a stray value in the developer's shell must not
  // change what the policy tests are asserting against.
  process.env[key] = value;
}
