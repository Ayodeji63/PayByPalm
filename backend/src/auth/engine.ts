/** Central identity service. Supabase remains the application database only. */
import { AsyncLocalStorage } from 'node:async_hooks';
import { betterAuth } from 'better-auth';
import { bearer } from 'better-auth/plugins';
import { hashPassword, verifyPassword } from 'better-auth/crypto';
import bcrypt from 'bcryptjs';
import pg from 'pg';
import { rootCertificates } from 'node:tls';
import { supabaseRootCertificate } from './supabase-ca.js';
import { PostgresDialect } from 'kysely';
import { AppError } from '../errors.js';

const deliveryStatus = new AsyncLocalStorage<{ failure?: unknown }>();
/** Better Auth deliberately swallows mail callback errors. Surface delivery failures safely. */
export async function withDeliveryStatus<T>(operation: () => Promise<T>): Promise<T> {
  return deliveryStatus.run({}, async () => {
    const result = await operation();
    const failure = deliveryStatus.getStore()?.failure;
    if (failure) throw failure;
    return result;
  });
}

export interface AuthSettings {
  databaseURL: string; secret: string; baseURL: string; walletURL: string;
  send: (email: string, purpose: 'verify' | 'reset', token: string) => Promise<void>;
}

/** TLS with certificate validation for hosted Postgres; plain TCP only on loopback. */
export function authPool(databaseURL: string) {
  const url = new URL(databaseURL);
  if (!['postgres:', 'postgresql:'].includes(url.protocol)) throw new Error('AUTH_DATABASE_URL must be PostgreSQL');
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  // pg connection-string SSL options can silently override certificate validation.
  for (const key of ['sslmode', 'sslcert', 'sslkey', 'sslrootcert', 'uselibpqcompat', 'options']) url.searchParams.delete(key);
  const supabase = url.hostname.endsWith('.pooler.supabase.com') || /^db\.[a-z0-9]+\.supabase\.co$/.test(url.hostname);
  const ssl = local ? false : { rejectUnauthorized: true,
    ...(supabase ? { ca: [...rootCertificates, supabaseRootCertificate] } : {}),
  };
  const pool = new pg.Pool({ connectionString: url.href, max: 5, connectionTimeoutMillis: 8000,
    idleTimeoutMillis: 30000, query_timeout: 15000, ssl });
  // Idle connection failures must not terminate the payment API or leak a URI.
  pool.on('error', () => { console.error('Authentication database connection interrupted.'); });
  return pool;
}

export function createIdentity(settings: AuthSettings, pool = authPool(settings.databaseURL)) {
  const send: AuthSettings['send'] = async (...args) => {
    try { await settings.send(...args); } catch (error) {
      const status = deliveryStatus.getStore();
      if (status) status.failure = error;
      throw error;
    }
  };
  const engine = betterAuth({
    appName: 'PayByPalm', baseURL: settings.baseURL, basePath: '/internal-auth',
    secret: settings.secret, database: { dialect: new PostgresDialect({ pool }), type: 'postgres', schemaName: 'pbp_auth', transaction: true },
    // Do not log library messages: some include email addresses and SQL parameters.
    logger: { disabled: true },
    trustedOrigins: [new URL(settings.walletURL).origin, new URL(settings.baseURL).origin],
    advanced: { database: { generateId: 'uuid' } },
    emailAndPassword: { enabled: true, autoSignIn: false, requireEmailVerification: true,
      minPasswordLength: 8, maxPasswordLength: 200, revokeSessionsOnPasswordReset: true,
      password: { hash: hashPassword, verify: async ({ hash, password }) =>
        /^\$2[aby]\$/.test(hash) ? bcrypt.compare(password, hash) : verifyPassword({ hash, password }) },
      sendResetPassword: async ({ user, token }) => send(user.email, 'reset', token),
    },
    emailVerification: { sendOnSignUp: false, sendOnSignIn: false,
      autoSignInAfterVerification: false, expiresIn: 3600,
      sendVerificationEmail: async ({ user, token }) => send(user.email, 'verify', token),
    },
    user: { additionalFields: { phone: { type: 'string', required: true, returned: false },
      disabled: { type: 'boolean', required: true, defaultValue: false, input: false, returned: false } } },
    session: { expiresIn: 60 * 60 * 24 * 7, updateAge: 60 * 60 * 24, cookieCache: { enabled: false } },
    plugins: [bearer()],
  });
  return { engine, pool };
}

export async function deliverAuthEmail(apiKey: string, from: string, walletURL: string,
  email: string, purpose: 'verify' | 'reset', token: string, transport = fetch) {
  const target = new URL(purpose === 'verify' ? '/auth/confirm' : '/auth/reset', walletURL);
  target.hash = new URLSearchParams({ token }).toString();
  const action = purpose === 'verify' ? 'Verify your email' : 'Reset your password';
  let response: Response;
  try {
    response = await transport('https://api.resend.com/emails', {
      method: 'POST', redirect: 'error', signal: AbortSignal.timeout(10000),
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to: [email], subject: `${action} — PayByPalm`,
        text: `${action} for PayByPalm:\n\n${target.href}\n\nIf you did not request this email, you can ignore it.`,
      }),
    });
  } catch { throw new AppError(503, 'email_send_failed', 'Authentication email could not be delivered.'); }
  if (!response.ok) {
    // Never echo provider bodies or recipient details into logs or responses.
    await response.body?.cancel();
    throw new AppError(503, response.status === 429 ? 'email_delivery_limited' : 'email_send_failed', 'Authentication email could not be delivered.');
  }
  await response.body?.cancel();
}
