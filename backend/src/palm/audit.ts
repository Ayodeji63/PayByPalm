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

import { randomUUID } from 'node:crypto';
import { operations, operationContext } from '../services/operationEvents.js';
import { AppError } from '../errors.js';
import { db } from '../db/client.js';
import { logger } from '../logger.js';
import { PalmProviderError } from '../errors.js';
import type {
  CompareResult,
  DeleteResult,
  PalmOperation,
  PalmProvider,
  RegisterResult,
} from './provider.js';

interface AuditRow {
  provider: string;
  provider_request_id: string | null;
  timings: Record<string, number> | null;
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
    const span=randomUUID(), kind=endpoint==='compare'?'verification' as const:endpoint==='search'?'identification' as const:'enrollment' as const;
    const context={...operationContext.getStore(),...(userId?{userId}: {})};
    operations.emit(kind,endpoint,'started',{provider:inner.name},context,span);
    try {
      const result = await call();
      const d = describe(result);
      const meta=(result as {meta?: import('./provider.js').ProviderMeta}).meta;
      operations.emit(kind,endpoint,d.isMatch===false?'rejected':'succeeded',{provider:inner.name,upstreamRequestId:meta?.requestId,candidateCount:Array.isArray((result as {candidates?:unknown}).candidates)?(result as {candidates:unknown[]}).candidates.length:undefined,score:d.score,providerMatched:d.isMatch,sampleCount:meta?.sampleCount,minimumPairSimilarity:meta?.minimumPairSimilarity,cosineSimilarity:meta?.cosineSimilarity,timings:meta?.timings,durationMs:Date.now()-startedAt},{...context,...(d.userId?{userId:d.userId}:{})},span);
      await record({
        endpoint, provider: inner.name, provider_request_id: extractRequestId(result),
        timings: (result as {meta?: {timings?: Record<string, number>}})?.meta?.timings ?? null,
        tencent_request_id: inner.name === 'tencent' ? extractRequestId(result) : null,
        user_id: d.userId !== undefined ? d.userId : userId,
        score: d.score,
        is_match: d.isMatch,
        latency_ms: Date.now() - startedAt,
        error_code: null,
      });
      return result;
    } catch (err) {
      operations.emit(kind,endpoint,err instanceof AppError && err.status<500?'rejected':'failed',{provider:inner.name,errorCode:err instanceof AppError?err.code:'upstream_error',durationMs:Date.now()-startedAt},context,span);
      await record({
        endpoint, provider: inner.name, provider_request_id: requestIdOf(err), timings: null,
        tencent_request_id: inner.name === 'tencent' ? requestIdOf(err) : null,
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

    ...(inner.createSdkToken ? { createSdkToken: (userId: string) => audited(
      'sdk_token', userId, () => inner.createSdkToken!(userId), () => ({ score: null, isMatch: null }),
    ) } : {}),
    ...(inner.registerCapture ? { registerCapture: (userId: string, capture: import('./sdkCapture.js').SdkCapture) => audited(
      'register', userId, () => inner.registerCapture!(userId, capture), () => ({ score: null, isMatch: true }),
    ) } : {}),
    ...(inner.compareCapture ? { compareCapture: (userId: string, capture: import('./sdkCapture.js').SdkCapture) => audited(
      'compare', userId, () => inner.compareCapture!(userId, capture), r => ({ score: r.score, isMatch: r.isMatch }),
    ) } : {}),

    ...(inner.registerSamples ? { registerSamples: (userId: string, input: import('./provider.js').SampleRegistration) => audited(
      'register', userId, () => inner.registerSamples!(userId, input), () => ({ score: null, isMatch: true }),
    ) } : {}),
    ...(inner.identify ? { identify: (imageB64: string, bindings: import('./provider.js').ProviderBinding[]) => audited(
      'search', null, () => inner.identify!(imageB64, bindings), r => ({ score: r.candidates[0]?.score ?? null, isMatch: r.meta?.providerIsMatch ?? false, userId: r.candidates[0]?.userId ?? null }),
    ) } : {}),

    register: (userId, imageB64) =>
      audited<RegisterResult>(
        'register',
        userId,
        () => inner.register(userId, imageB64),
        () => ({ score: null, isMatch: true }),
      ),

    compare: (userId, imageB64, binding) =>
      audited<CompareResult>(
        'compare',
        userId,
        () => inner.compare(userId, imageB64, binding),
        (r) => ({ score: r.score, isMatch: r.meta?.providerIsMatch ?? r.isMatch }),
      ),

    delete: (userId, binding) =>
      audited<DeleteResult>(
        'delete',
        userId,
        () => inner.delete(userId, binding),
        () => ({ score: null, isMatch: null }),
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
