import { config } from '../config.js';
import { logger } from '../logger.js';
import { authPool } from './engine.js';
import { authFailureReason } from './diagnostics.js';

/** Nonblocking startup probe. Logs names/classifications, never values or rows. */
export async function checkAuthReadiness(): Promise<void> {
  const required = ['AUTH_DATABASE_URL', 'AUTH_SECRET', 'RESEND_API_KEY', 'RESEND_FROM_EMAIL'] as const;
  const missing = required.filter(key => !config[key]);
  if (missing.length) {
    logger.error({ reason: 'auth_settings_missing', missing }, 'Authentication readiness failed');
    return;
  }
  let pool: ReturnType<typeof authPool> | undefined;
  try {
    pool = authPool(config.AUTH_DATABASE_URL!);
    // Resolve all engine tables and check access without retrieving user data.
    await pool.query(`select 1 from pbp_auth."user", pbp_auth.account,
      pbp_auth.session, pbp_auth.verification where false`);
    // PL/pgSQL resolves helpers on execution, so table-only probes miss this.
    const phone = await pool.query<{ canonical: string }>(
      `select public.canonical_sms_phone('+2348010001234') as canonical`,
    );
    if (phone.rows[0]?.canonical !== '08010001234') {
      logger.error({ reason: 'signup_phone_helper_invalid' }, 'Authentication readiness failed');
      return;
    }
    logger.info({ authentication: 'ready' }, 'Authentication database ready');
  } catch (error) {
    logger.error({ reason: authFailureReason(error) }, 'Authentication readiness failed');
  } finally {
    await pool?.end().catch(() => {});
  }
}
