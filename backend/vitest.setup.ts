/**
 * Test environment.
 *
 * src/config.ts validates the environment at import time and exits the process if
 * it is incomplete. A setup file is imported before the test modules that pull in
 * config, so this is the only place the values can be set early enough.
 *
 * Everything here is syntactically valid and functionally inert — no test in this
 * suite contacts an external service, so the Supabase URL and keys are never dialled. The
 * thresholds are pinned rather than inherited from a developer's .env so the
 * policy tests assert against known boundaries.
 */

import 'dotenv/config';

const TEST_ENV: Record<string, string> = {
  NODE_ENV: 'test',
  PAYSTACK_MODE: 'test',
  PAYSTACK_SECRET_KEY: 'sk_test_inert',
  CARD_TOKEN_ENCRYPTION_KEY: Buffer.alloc(32,1).toString('base64'),
  AUTH_DATABASE_URL: 'postgresql://test:inert@localhost:5432/test',
  AUTH_SECRET: 'inert-test-auth-secret-at-least-thirty-two-characters',
  RESEND_API_KEY: 're_test_inert',
  RESEND_FROM_EMAIL: 'test@example.com',
  SUPABASE_URL: 'https://test.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'test-service-role-key',
  SUPABASE_ANON_KEY: 'test-anon-key',
  WALLET_BASE_URL: 'http://localhost:5173',
  EXTRA_CORS_ORIGINS: 'https://www.paybypalm.app,https://paybypalm.app',
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
