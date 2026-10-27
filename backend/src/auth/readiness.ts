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
    logger.info({ authentication: 'ready' }, 'Authentication database ready');
  } catch (error) {
    logger.error({ reason: authFailureReason(error) }, 'Authentication readiness failed');
  } finally {
    await pool?.end().catch(() => {});
  }
}
