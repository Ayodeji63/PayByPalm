/** Fixed classifications only: driver messages may contain credentials or SQL. */
const reasons: Record<string, string> = {
  '28P01': 'database_password_rejected',
  '28000': 'database_access_rejected',
  '3D000': 'database_not_found',
  '3F000': 'auth_schema_missing',
  '42P01': 'auth_tables_missing',
  '42883': 'signup_database_helper_missing',
  '42501': 'database_permission_denied',
  '53300': 'database_connection_limit',
  '57014': 'database_query_timeout',
  ECONNREFUSED: 'database_connection_refused',
  ECONNRESET: 'database_connection_reset',
  ENETUNREACH: 'database_network_unreachable',
  EHOSTUNREACH: 'database_network_unreachable',
  ENOTFOUND: 'database_hostname_not_found',
  ETIMEDOUT: 'database_connection_timeout',
  SELF_SIGNED_CERT_IN_CHAIN: 'database_certificate_untrusted',
  UNABLE_TO_VERIFY_LEAF_SIGNATURE: 'database_certificate_untrusted',
  CERT_HAS_EXPIRED: 'database_certificate_expired',
  ERR_TLS_CERT_ALTNAME_INVALID: 'database_certificate_hostname_mismatch',
};

export function authFailureReason(error: unknown): string {
  const pending: unknown[] = [error];
  const visited = new Set<unknown>();
  while (pending.length && visited.size < 12) {
    const value = pending.shift();
    if (!value || typeof value !== 'object' || visited.has(value)) continue;
    visited.add(value);
    const candidate = value as { code?: unknown; message?: unknown; cause?: unknown; errors?: unknown };
    if (typeof candidate.code === 'string' && Object.hasOwn(reasons, candidate.code))
      return reasons[candidate.code]!;
    if (candidate.message === 'Connection terminated due to connection timeout' ||
        candidate.message === 'Query read timeout') return 'database_connection_timeout';
    pending.push(candidate.cause);
    if (Array.isArray(candidate.errors)) pending.push(...candidate.errors.slice(0, 12));
  }
  return 'unexpected_auth_error';
}
