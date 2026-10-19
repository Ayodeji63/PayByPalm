/**
 * Tencent PalmAI provider.
 *
 * THIS IS THE ONLY FILE IN THE REPOSITORY THAT READS TENCENT_PALM_API_KEY.
 *
 * The key lives in backend environment variables and travels no further. It is
 * never sent to the browser, never sent to the Pi, and never included in a
 * response body or a log line. The Pi posts an image to us; we call Tencent.
 * `pnpm guard:secrets` in the wallet app exists to keep that true.
 *
 * API SHAPE
 *   Base    https://open.intl.palm.tencent.com
 *   Auth    Authorization: Bearer ak_xxxxx
 *   Type    application/json; charset=utf-8
 *   Envelope { code, message, requestId, data }, where code !== 0 means failure.
 *
 * This adapter uses register, compare, search and per-user delete. It has no
 * gallery-list or bulk-delete operation.
 */

import { randomBytes } from 'node:crypto';
import { config } from '../config.js';
import { logger } from '../logger.js';
import { PalmProviderError } from '../errors.js';
import { createTokenBucket } from '../lib/rateLimiter.js';
import { classifyTencentError, isTencentPalmAbsent, isTencentSearchMiss } from './tencentErrors.js';
import type {
  CompareResult,
  DeleteResult,
  PalmProvider,
  RegisterResult,
  SearchResult,
  SdkToken,
} from './provider.js';
import type { SdkCapture } from './sdkCapture.js';

/** Documented limit is 20 req/s; leave headroom so a burst does not trip it. */
const limiter = createTokenBucket(18);

const REQUEST_TIMEOUT_MS = 15_000;

/** ImageType 1 = RGB, per the PalmAI request schema. */
const IMAGE_TYPE_RGB = 1;

interface Envelope<T> {
  code: number;
  message: string;
  requestId?: string;
  data: T;
}

interface RegisterData {
  PalmId: string;
}

interface CompareData {
  IsMatch: boolean;
  Score: number;
  AlgorithmVersion?: string;
  PalmDirection?: number;
}

interface SearchData {
  UserId: string;
  Score: number;
  AlgorithmVersion?: string;
  PalmDirection?: number;
}

/**
 * One POST to PalmAI, with rate limiting, a timeout, and envelope unwrapping.
 *
 * Every failure ends as a PalmProviderError carrying the original business code,
 * HTTP status and request ID. Raw provider messages stay in server diagnostics;
 * the error middleware supplies fixed public explanations. Keys and images are
 * never attached to the error.
 */
async function call<T>(path: string, body: unknown): Promise<{ data: T; requestId?: string }> {
  await limiter.acquire();

  const url = `${config.TENCENT_BASE_URL}${path}`;
  // Guide §3.3: optional 32-character lowercase hex correlation ID.
  const traceId = randomBytes(16).toString('hex');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    // Store only the credential in Render. Tolerate an accidentally pasted
    // prefix so the outbound header always contains exactly one `Bearer `.
    const credential = (config.TENCENT_PALM_API_KEY as string)
      .replace(/^Bearer\s+/i, '')
      .trim();
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${credential}`,
        'Content-Type': 'application/json; charset=utf-8',
        'X-TraceId': traceId,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    // Tencent can return a business error with HTTP 400 or another non-2xx.
    // Parse the envelope before considering the transport status, preserving
    // both identities. Never log a raw gateway response body.
    const raw: unknown = await response.json().catch(error => {
      if (error instanceof Error && error.name === 'AbortError') throw error;
      return null;
    });
    const envelope = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw as Partial<Envelope<T>> : null;
    if (typeof envelope?.code === 'number' && Number.isSafeInteger(envelope.code) && envelope.code > 0) {
      const requestId = typeof envelope.requestId === 'string' ? envelope.requestId : undefined;
      let diagnostic = typeof envelope.message === 'string' ? envelope.message : 'Palm service rejected the request.';
      const submitted = body as {UserToken?: string; RgbImage?: {Data?: string}; LivenessRgbImage?: {Data?: string}};
      for (const sensitive of [credential, submitted?.UserToken, submitted?.RgbImage?.Data, submitted?.LivenessRgbImage?.Data]) {
        if (sensitive) diagnostic = diagnostic.replaceAll(sensitive, '[redacted]');
      }
      diagnostic = diagnostic.slice(0, 1000);
      logger.warn(
        { path, traceId, status: response.status, code: envelope.code, requestId,
          providerDescription: classifyTencentError(envelope.code, diagnostic).description, message: diagnostic },
        'palm provider returned an error envelope',
      );
      throw new PalmProviderError(diagnostic, {providerCode: envelope.code, requestId, httpStatus: response.status});
    }
    if (!response.ok) {
      logger.warn({path, traceId, status: response.status}, 'palm provider returned a non-2xx response');
      throw new PalmProviderError(`Palm service returned HTTP ${response.status}.`, {httpStatus: response.status});
    }
    if (!envelope || envelope.code !== 0 || !Object.hasOwn(envelope, 'data')) {
      throw new PalmProviderError('Palm service returned a malformed response.', {httpStatus: response.status});
    }
    return {data: envelope.data as T, requestId: typeof envelope.requestId === 'string' ? envelope.requestId : undefined};
  } catch (err) {
    if (err instanceof PalmProviderError) throw err;
    const aborted = err instanceof Error && err.name === 'AbortError';
    throw new PalmProviderError(
      aborted
        ? `Palm service did not respond within ${REQUEST_TIMEOUT_MS / 1000}s.`
        : 'Could not reach the palm service.',
    );
  } finally {
    clearTimeout(timeout);
  }
}

const rgbImage = (imageB64: string) => ({ Data: imageB64, ImageType: IMAGE_TYPE_RGB });

function verifiedCompare(data: CompareData, requestId?: string): CompareResult {
  if (typeof data?.IsMatch !== 'boolean' || !Number.isFinite(data.Score) || data.Score < 0 || data.Score > 100) {
    throw new PalmProviderError('Palm service returned an invalid comparison result.', { requestId });
  }
  return { isMatch: data.IsMatch, score: data.Score, meta: { requestId, providerIsMatch: data.IsMatch } };
}

// The SDK image-only contract contains no uploaded video. Never invent a video
// ID or assert server video-liveness success. Tencent must accept its encrypted
// image/liveness pair with application quality enabled, or this call fails.
const captureBody = (capture: SdkCapture) => ({
  RgbImage: capture.RgbImage,
  LivenessRgbImage: capture.LivenessRgbImage,
  UserToken: capture.UserToken,
});

export function createTencentProvider(): PalmProvider {
  return {
    name: 'tencent',

    async createSdkToken(userId: string): Promise<SdkToken> {
      const { data, requestId } = await call<{Token: string; ExpiresAt: number | string}>(
        '/palm/openai/x/oauth/sdk/usertoken/create', { UserId: userId, TtlSeconds: 180 },
      );
      // The live gateway serializes ExpiresAt as a string; the supplied guide
      // describes Unix seconds. Accept explicit numeric seconds or ISO UTC.
      const expiry = typeof data?.ExpiresAt === 'string'
        ? (/^\d+$/.test(data.ExpiresAt) ? Number(data.ExpiresAt) : /^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(data.ExpiresAt) ? Date.parse(data.ExpiresAt) / 1000 : NaN)
        : data?.ExpiresAt;
      if (typeof data?.Token !== 'string' || !data.Token.startsWith('sut_') || !Number.isFinite(expiry) || expiry <= Date.now() / 1000 || expiry > Date.now() / 1000 + 86400) {
        throw new PalmProviderError('Palm service returned an invalid SDK credential.', { requestId });
      }
      return { token: data.Token, expiresAt: expiry, meta: { requestId } };
    },

    async registerCapture(userId, capture) {
      const { data, requestId } = await call<Partial<RegisterData> & {UserId?: string}>(
        '/palm/openai/register_rgb_palm', { ...captureBody(capture), UserId: userId, IsForce: false, CheckAppQuality: true },
      );
      if (!data || typeof data !== 'object' || Array.isArray(data) || (data.UserId === undefined && !(typeof data.PalmId === 'string' && data.PalmId.length > 0))) {
        throw new PalmProviderError('Palm service returned an invalid registration result.', { requestId });
      }
      if (data?.UserId !== undefined && data.UserId !== userId) throw new PalmProviderError('Palm registration returned a different user.', { requestId });
      if (typeof data?.PalmId === 'string' && data.PalmId.length > 0) return { palmId: data.PalmId, meta: { requestId } };
      // New SDK registration responses can contain UserId instead of PalmId.
      // Resolve the actual identifier from an authoritative registration read.
      const check = await call<{LeftPalm?: {PalmId?: string; PalmState?: number}; RightPalm?: {PalmId?: string; PalmState?: number}}>(
        '/palm/openai/get_palm', { UserId: userId },
      );
      const active = [check.data?.LeftPalm, check.data?.RightPalm].find(p => p?.PalmState === 1 && typeof p.PalmId === 'string' && p.PalmId.length > 0);
      if (!active?.PalmId) throw new PalmProviderError('Palm registration could not be confirmed.', { requestId: check.requestId });
      return { palmId: active.PalmId, meta: { requestId } };
    },

    async compareCapture(userId, capture) {
      const { data, requestId } = await call<CompareData>('/palm/openai/compare_rgb_palm', {
        ...captureBody(capture), CompareUserId: userId, CheckAppQuality: true,
      });
      return verifiedCompare(data, requestId);
    },

    async register(userId: string, imageB64: string): Promise<RegisterResult> {
      const { data, requestId } = await call<RegisterData>('/palm/openai/register_rgb_palm', {
        UserId: userId,
        RgbImage: rgbImage(imageB64),
        // Enrolment is one-time and enforced in our own database. Sending false
        // means the provider will not silently overwrite an existing template.
        IsForce: false,
      });

      return { palmId: data.PalmId, meta: { requestId, providerIsMatch: true } };
    },

    async compare(userId: string, imageB64: string): Promise<CompareResult> {
      const { data, requestId } = await call<CompareData>('/palm/openai/compare_rgb_palm', {
        RgbImage: rgbImage(imageB64),
        CompareUserId: userId,
      });

      return verifiedCompare(data, requestId);
    },

    async search(imageB64: string): Promise<SearchResult | null> {
      let response: { data: SearchData; requestId?: string };
      try {
        response = await call<SearchData>('/palm/openai/search_rgb_palm', {
          RgbImage: rgbImage(imageB64),
        });
      } catch (error) {
        // Both published code tables define a normal search miss. Neither is
        // a verified identity.
        // Other application, image, credential and transport failures propagate.
        if (error instanceof PalmProviderError && isTencentSearchMiss(error.providerCode)) return null;
        throw error;
      }
      const { data, requestId } = response;
      if (!data?.UserId) return null;

      return {
        userId: data.UserId,
        score: data.Score,
        meta: { requestId, providerIsMatch: true },
      };
    },

    async delete(userId: string): Promise<DeleteResult> {
      const { requestId } = await call<Record<string, never>>('/palm/openai/delete_palm', {
        UserId: userId,
        // Tencent: 1 = left, 2 = right. Delete both so the account can enrol
        // either hand again without retaining an orphaned biometric template.
        PalmDirectionList: [1, 2],
      });

      // An acknowledged delete is followed by a read-only check before the
      // caller clears local state. A failed check keeps cleanup retryable.
      try {
        const { data, requestId: checkId } = await call<{LeftPalm?:{PalmState?:number;RegisterTime?:number};RightPalm?:{PalmState?:number;RegisterTime?:number}}>('/palm/openai/get_palm', { UserId: userId });
        const absent = (p: {PalmState?:number;RegisterTime?:number}|undefined) => p == null || (typeof p === 'object' && !Array.isArray(p) && (!Object.keys(p).length || (p.PalmState === 0 && (p.RegisterTime ?? 0) === 0)));
        if (!data || typeof data !== 'object' || Array.isArray(data) || !absent(data.LeftPalm) || !absent(data.RightPalm)) {
          throw new PalmProviderError('Palm deletion could not be verified.', { requestId: checkId });
        }
      } catch (error) {
        // Documented GetPalm result when the user has no registered palms.
        if (!(error instanceof PalmProviderError && isTencentPalmAbsent(error.providerCode, error.providerHttpStatus))) throw error;
      }

      return { meta: { requestId } };
    },
  };
}
