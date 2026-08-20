/**
 * Auditing decorator for the palm provider.
 *
 * Wraps any PalmProvider so that EVERY call — success and failure alike — writes a
 * row to palm_audit with the provider's request id, the score, the latency, and
 * the error code. This is the dispute trail: months later it is what lets us
 * answer "why was this person charged?".
 *
 * The logging lives here, in one wrapper, rather than at each call site. A call
 * site can forget to log; a decorator cannot be forgotten, because there is no way
 * to reach the provider except through it.
 *
 * Images are never recorded. Only the outcome.
 */

import { db } from '../db/client.js';
import { logger } from '../logger.js';
import { PalmProviderError } from '../errors.js';
import type {
  CompareResult,
  PalmOperation,
  PalmProvider,
  RegisterResult,
  SearchResult,
} from './provider.js';

interface AuditRow {
  endpoint: PalmOperation;
  tencent_request_id: string | null;
  user_id: string | null;
  score: number | null;
  is_match: boolean | null;
  latency_ms: number;
  error_code: number | null;
}

/**
 * Write one audit row.
 *
 * Deliberately does not throw. A failed audit write is logged loudly at error
 * level but does not abort the operation in flight: refusing a payment because a
 * logging table was briefly unavailable is a worse outcome for the person
 * standing at the terminal than a gap in the trail. The error-level log is the
 * signal that the gap exists.
 */
async function record(row: AuditRow): Promise<void> {
  const { error } = await db.from('palm_audit').insert(row);
  if (error) {
    logger.error(
      { err: error, audit: row },
      'FAILED TO WRITE PALM AUDIT ROW — dispute trail has a gap',
    );
  }
}

/** Pull the provider's error code out of whatever was thrown, if it has one. */
function errorCodeOf(err: unknown): number | null {
  if (err instanceof PalmProviderError && typeof err.providerCode === 'number') {
    return err.providerCode;
  }
  // A transport failure never reached the provider, so it has no code of its own.
  return -1;
}

function requestIdOf(err: unknown): string | null {
  return err instanceof PalmProviderError ? err.requestId ?? null : null;
}

export function withAudit(inner: PalmProvider): PalmProvider {
  /**
   * Shared timing/logging path. `describe` maps a successful result onto the
   * audit columns; everything else is identical across the three operations.
   */
  async function audited<T>(
    endpoint: PalmOperation,
    userId: string | null,
    call: () => Promise<T>,
    describe: (result: T) => { score: number | null; isMatch: boolean | null; userId?: string | null },
  ): Promise<T> {
    const startedAt = Date.now();
    try {
      const result = await call();
      const d = describe(result);
      await record({
        endpoint,
        tencent_request_id: extractRequestId(result),
        user_id: d.userId !== undefined ? d.userId : userId,
        score: d.score,
        is_match: d.isMatch,
        latency_ms: Date.now() - startedAt,
        error_code: null,
      });
      return result;
    } catch (err) {
      await record({
        endpoint,
        tencent_request_id: requestIdOf(err),
        user_id: userId,
        score: null,
        is_match: null,
        latency_ms: Date.now() - startedAt,
        error_code: errorCodeOf(err),
      });
      throw err;
    }
  }

  return {
    name: inner.name,

    register: (userId, imageB64) =>
      audited<RegisterResult>(
        'register',
        userId,
        () => inner.register(userId, imageB64),
        () => ({ score: null, isMatch: true }),
      ),

    compare: (userId, imageB64) =>
      audited<CompareResult>(
        'compare',
        userId,
        () => inner.compare(userId, imageB64),
        (r) => ({ score: r.score, isMatch: r.meta?.providerIsMatch ?? r.isMatch }),
      ),

    search: (imageB64) =>
      audited<SearchResult | null>(
        'search',
        null,
        () => inner.search(imageB64),
        (r) =>
          r === null
            ? // A clean "nobody matched" is a real, loggable outcome, not an error.
              { score: null, isMatch: false, userId: null }
            : { score: r.score, isMatch: r.meta?.providerIsMatch ?? true, userId: r.userId },
      ),
  };
}

/** Read the request id off any result shape that carries meta. */
function extractRequestId(result: unknown): string | null {
  if (result && typeof result === 'object' && 'meta' in result) {
    const meta = (result as { meta?: { requestId?: string } }).meta;
    return meta?.requestId ?? null;
  }
  return null;
}
