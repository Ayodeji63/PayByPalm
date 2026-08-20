/**
 * Environment configuration.
 *
 * Parsed and validated once, at boot. A malformed environment kills the process
 * immediately with a readable message rather than surfacing as a confusing runtime
 * failure halfway through a payment.
 */

import 'dotenv/config';
import { z } from 'zod';

/** Coerce a numeric env var, keeping a readable error when it is not a number. */
const intFromEnv = (fallback: number) =>
  z.coerce.number().int().refine(Number.isFinite, 'must be an integer').default(fallback);

const schema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: intFromEnv(8080),
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

    SUPABASE_URL: z.string().url('SUPABASE_URL must be a full URL'),
    SUPABASE_SERVICE_ROLE_KEY: z.string().min(1, 'SUPABASE_SERVICE_ROLE_KEY is required'),
    SUPABASE_ANON_KEY: z.string().min(1, 'SUPABASE_ANON_KEY is required'),

    PALM_PROVIDER: z.enum(['tencent', 'mock']).default('mock'),
    TENCENT_BASE_URL: z.string().url().default('https://open.intl.palm.tencent.com'),
    TENCENT_PALM_API_KEY: z.string().optional(),
    MOCK_PALM_SCORE: intFromEnv(92),

    PALM_ACCEPT_SCORE: intFromEnv(85),
    PALM_STEP_UP_SCORE: intFromEnv(70),
    MAX_CANDIDATES: intFromEnv(4),

    ENROL_SESSION_TTL_SECONDS: intFromEnv(90),
    AUTH_VALIDITY_SECONDS: intFromEnv(60),

    WALLET_BASE_URL: z.string().url('WALLET_BASE_URL must be a full URL'),
    EXTRA_CORS_ORIGINS: z.string().default(''),
    MAX_IMAGE_BYTES: intFromEnv(2 * 1024 * 1024),
  })
  // The real key is only needed when the real provider is selected. This is what
  // lets the entire app run — and be demoed — with no Tencent access at all.
  .refine((c) => c.PALM_PROVIDER !== 'tencent' || !!c.TENCENT_PALM_API_KEY, {
    message: 'TENCENT_PALM_API_KEY is required when PALM_PROVIDER=tencent',
    path: ['TENCENT_PALM_API_KEY'],
  })
  // An inverted pair would silently collapse the step-up band to nothing, sending
  // mid-confidence matches straight to accept.
  .refine((c) => c.PALM_STEP_UP_SCORE < c.PALM_ACCEPT_SCORE, {
    message: 'PALM_STEP_UP_SCORE must be below PALM_ACCEPT_SCORE',
    path: ['PALM_STEP_UP_SCORE'],
  })
  .refine((c) => c.MAX_CANDIDATES >= 1, {
    message: 'MAX_CANDIDATES must be at least 1',
    path: ['MAX_CANDIDATES'],
  });

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  const detail = parsed.error.issues
    .map((i) => `  ${i.path.join('.') || '(root)'}: ${i.message}`)
    .join('\n');
  // Deliberately console.error, not the logger — the logger is configured from
  // the very config that just failed to parse.
  console.error(`Invalid environment configuration:\n${detail}\n\nSee .env.example.`);
  process.exit(1);
}

export const config = Object.freeze({
  ...parsed.data,
  isProduction: parsed.data.NODE_ENV === 'production',

  /** Origins permitted to call this API. */
  corsOrigins: [
    parsed.data.WALLET_BASE_URL,
    ...parsed.data.EXTRA_CORS_ORIGINS.split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  ],
});

export type Config = typeof config;
