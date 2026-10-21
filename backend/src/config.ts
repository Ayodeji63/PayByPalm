/**
 * Environment configuration.
 *
 * Parsed and validated once, at boot. A malformed environment kills the process
 * immediately with a readable message rather than surfacing as a confusing runtime
 * failure halfway through a payment.
 */

import 'dotenv/config';
import { z } from 'zod/v3';

/** Coerce a numeric env var, keeping a readable error when it is not a number. */
const optionalSetting = <T extends z.ZodTypeAny>(schema: T) => z.preprocess(value => value === '' ? undefined : value, schema.optional());

const intFromEnv = (fallback: number) =>
  z.coerce.number().int().refine(Number.isFinite, 'must be an integer').default(fallback);

export const configSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: intFromEnv(8080),
    TRUST_PROXY_HOPS: intFromEnv(0).refine(n => n >= 0 && n <= 1, 'must be 0 or 1'),
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

    SUPABASE_URL: z.string().url('SUPABASE_URL must be a full URL'),
    SUPABASE_SERVICE_ROLE_KEY: z.string().min(1, 'SUPABASE_SERVICE_ROLE_KEY is required'),
    SUPABASE_ANON_KEY: z.string().optional(), // Legacy tools only; Auth no longer uses it.
    AUTH_DATABASE_URL: optionalSetting(z.string().url().refine(value=>{
      try { return ['postgres:','postgresql:'].includes(new URL(value).protocol); } catch { return false; }
    },'Use a PostgreSQL connection URI')),
    AUTH_SECRET: optionalSetting(z.string().min(32)),
    AUTH_BASE_URL: z.string().url().default('https://paybypalm-backend.onrender.com').refine(value=>{
      try {
      const u=new URL(value);
      return u.pathname==='/' && !u.search && !u.hash && !u.username && !u.password &&
        (u.protocol==='https:' || (u.protocol==='http:' && ['localhost','127.0.0.1'].includes(u.hostname)));
      } catch { return false; }
    },'Use the backend HTTPS origin, or loopback HTTP for development'),
    RESEND_API_KEY: optionalSetting(z.string().min(1)),
    RESEND_FROM_EMAIL: optionalSetting(z.string().email()),

    PAYSTACK_MODE: z.enum(['test', 'live']).default('test'),
    PAYSTACK_SECRET_KEY: z.string().regex(/^sk_(test|live)_[A-Za-z0-9]+$/).optional(),
    CARD_TOKEN_ENCRYPTION_KEY: z.string().regex(/^[A-Za-z0-9+/]{43}=$/, 'must be a base64 encoded 32-byte key').optional(),

    PALM_PROVIDER: z.enum(['tencent', 'mock']).default('mock'),
    TENCENT_BASE_URL: z.string().url().default('https://open.intl.palm.tencent.com'),
    TENCENT_PALM_API_KEY: z.string().optional(),
    // Keep H5 available for later testing; the Pi uses our original camera UI.
    TENCENT_CAPTURE_MODE: z.enum(['legacy', 'h5']).default('legacy'),
    // Capture-only skips SDK video upload. Enable for live payments only after
    // Tencent confirms this application's encrypted image/liveness contract.
    TENCENT_H5_IMAGE_ONLY_APPROVED: z.enum(['true', 'false']).default('false').transform(v => v === 'true'),
    MOCK_PALM_SCORE: intFromEnv(92),

    PALM_ACCEPT_SCORE: intFromEnv(85),
    PALM_STEP_UP_SCORE: intFromEnv(70),
    MAX_CANDIDATES: intFromEnv(4),

    ENROL_SESSION_TTL_SECONDS: intFromEnv(90),
    AUTH_VALIDITY_SECONDS: intFromEnv(60).refine((n) => n > 0 && n <= 60, 'must be between 1 and 60 seconds'),

    WALLET_BASE_URL: z.string().url('WALLET_BASE_URL must be a full URL'),
    EXTRA_CORS_ORIGINS: z.string().default(''),
    MAX_IMAGE_BYTES: intFromEnv(2 * 1024 * 1024).refine(n => n > 0 && n <= 8 * 1024 * 1024, 'must be between 1 byte and 8 MiB'),
  })
  .refine(c => !c.PAYSTACK_SECRET_KEY || !!c.CARD_TOKEN_ENCRYPTION_KEY, { message: 'CARD_TOKEN_ENCRYPTION_KEY is required with Paystack', path: ['CARD_TOKEN_ENCRYPTION_KEY'] })
  .refine(c => !c.PAYSTACK_SECRET_KEY || c.PAYSTACK_SECRET_KEY.startsWith(`sk_${c.PAYSTACK_MODE}_`), { message: 'Paystack key must match PAYSTACK_MODE; test mode rejects live keys', path: ['PAYSTACK_SECRET_KEY'] })
  .refine((c) => c.NODE_ENV !== 'production' || c.PALM_PROVIDER !== 'mock', {
    message: 'Mock payment authorization is forbidden in production',
    path: ['PALM_PROVIDER'],
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

const parsed = configSchema.safeParse(process.env);

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
