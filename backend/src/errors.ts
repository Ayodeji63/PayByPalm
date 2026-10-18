/**
 * Typed application errors.
 *
 * Everything thrown deliberately carries an HTTP status and a stable machine-
 * readable `code`, so clients branch on the code rather than parsing prose. The
 * error middleware turns anything else into a generic 500 without leaking
 * internals.
 */

export class AppError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: Record<string, unknown> | undefined;

  constructor(
    status: number,
    code: string,
    message: string,
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const badRequest = (code: string, message: string, details?: Record<string, unknown>) =>
  new AppError(400, code, message, details);

export const unauthorized = (message = 'Authentication required') =>
  new AppError(401, 'unauthorized', message);

export const forbidden = (message = 'Not permitted') => new AppError(403, 'forbidden', message);

export const notFound = (message = 'Not found') => new AppError(404, 'not_found', message);

export const conflict = (code: string, message: string, details?: Record<string, unknown>) =>
  new AppError(409, code, message, details);

export const paymentRequired = (message: string, details?: Record<string, unknown>) =>
  new AppError(402, 'insufficient_funds', message, details);

/**
 * A failed call to the palm provider.
 *
 * `requestId` is Tencent's own request identifier. It is surfaced to clients on
 * purpose: it is the only handle support can trace a failed match with. The API
 * key and the image never appear here.
 */
export class PalmProviderError extends AppError {
  readonly providerCode: number | undefined;
  readonly requestId: string | undefined;

  constructor(message: string, opts: { providerCode?: number; requestId?: string } = {}) {
    super(502, 'palm_provider_error', message, {
      providerCode: opts.providerCode,
      requestId: opts.requestId,
    });
    this.name = 'PalmProviderError';
    this.providerCode = opts.providerCode;
    this.requestId = opts.requestId;
  }
}

/**
 * Maps the custom SQLSTATEs raised by post_transaction() and post_topup() onto
 * HTTP responses. PostgREST passes the SQLSTATE through as `error.code`, so this
 * never has to string-match on a message.
 *
 * Defined in supabase/migrations/0007_functions.sql.
 */
const PG_ERROR_MAP: Record<string, { status: number; code: string; message: string }> = {
  PB001: { status: 404, code: 'transaction_not_found', message: 'Transaction not found' },
  PB002: {
    status: 409,
    code: 'invalid_transaction_state',
    message: 'This transaction is no longer awaiting confirmation',
  },
  PB003: { status: 402, code: 'insufficient_funds', message: 'Insufficient balance' },
  PB004: { status: 500, code: 'account_missing', message: 'A required ledger account is missing' },
  PB006: { status: 409, code: 'stale_authentication', message: 'Palm authorization expired. Please scan again.' },
  PB009: { status: 503, code: 'merchant_settlement_missing', message: 'This merchant is not configured for card settlement.' },
  PB008: { status: 409, code: 'no_active_card', message: 'Link an active default card before paying.' },
  PB007: { status: 409, code: 'sale_reference_conflict', message: 'This sale reference has different payment details.' },
  PB005: {
    status: 409,
    code: 'no_matched_user',
    message: 'Transaction has no authenticated payer',
  },
};

/** Translate a Postgres/PostgREST error into an AppError, or null if unrecognised. */
export function fromPostgresError(err: { code?: string; message?: string } | null): AppError | null {
  if (!err?.code) return null;
  const mapped = PG_ERROR_MAP[err.code];
  if (!mapped) return null;
  return new AppError(mapped.status, mapped.code, mapped.message);
}
