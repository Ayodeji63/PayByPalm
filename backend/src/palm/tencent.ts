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
 * Only three endpoints exist. There is no delete, no list, and no update.
 */

import { config } from '../config.js';
import { logger } from '../logger.js';
import { PalmProviderError } from '../errors.js';
import { createTokenBucket } from '../lib/rateLimiter.js';
import type {
  CompareResult,
  DeleteResult,
  PalmProvider,
  RegisterResult,
  SearchResult,
} from './provider.js';

/** Documented limit is 20 req/s; leave headroom so a burst does not trip it. */
const limiter = createTokenBucket(18);

const REQUEST_TIMEOUT_MS = 15_000;

/** ImageType 1 = RGB, per the PalmAI request schema. */
const IMAGE_TYPE_RGB = 1;

interface Envelope<T> {
  code: number;
  message: string;
  requestId: string;
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
 * Every failure mode ends as a PalmProviderError carrying the provider's message
 * and requestId. Those two are safe and useful to surface — the requestId is the
 * only handle support can trace a bad match with. The key and the image are not
 * included, here or anywhere.
 */
async function call<T>(path: string, body: unknown): Promise<{ data: T; requestId: string }> {
  await limiter.acquire();

  const url = `${config.TENCENT_BASE_URL}${path}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let response: Response;
  try {
    // Store only the credential in Render. Tolerate an accidentally pasted
    // prefix so the outbound header always contains exactly one `Bearer `.
    const credential = (config.TENCENT_PALM_API_KEY as string)
      .replace(/^Bearer\s+/i, '')
      .trim();
    response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${credential}`,
        'Content-Type': 'application/json; charset=utf-8',
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (err) {
    const aborted = err instanceof Error && err.name === 'AbortError';
    throw new PalmProviderError(
      aborted
        ? `Palm service did not respond within ${REQUEST_TIMEOUT_MS / 1000}s.`
        : 'Could not reach the palm service.',
    );
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    // A non-2xx with no parseable envelope — auth failure, gateway error, etc.
    // The body is read into the log but never into the thrown message, which a
    // terminal screen will display.
    const text = await response.text().catch(() => '');
    logger.warn(
      { path, status: response.status, body: text.slice(0, 500) },
      'palm provider returned a non-2xx response',
    );
    throw new PalmProviderError(`Palm service returned HTTP ${response.status}.`, {
      providerCode: response.status,
    });
  }

  let envelope: Envelope<T>;
  try {
    envelope = (await response.json()) as Envelope<T>;
  } catch {
    throw new PalmProviderError('Palm service returned a malformed response.');
  }

  if (envelope.code !== 0) {
    logger.warn(
      { path, code: envelope.code, requestId: envelope.requestId, message: envelope.message },
      'palm provider returned an error envelope',
    );
    throw new PalmProviderError(envelope.message || 'Palm service rejected the request.', {
      providerCode: envelope.code,
      requestId: envelope.requestId,
    });
  }

  return { data: envelope.data, requestId: envelope.requestId };
}

const rgbImage = (imageB64: string) => ({ Data: imageB64, ImageType: IMAGE_TYPE_RGB });

export function createTencentProvider(): PalmProvider {
  return {
    name: 'tencent',

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

      return {
        isMatch: data.IsMatch,
        score: data.Score,
        meta: { requestId, providerIsMatch: data.IsMatch },
      };
    },

    async search(imageB64: string): Promise<SearchResult | null> {
      const { data, requestId } = await call<SearchData>('/palm/openai/search_rgb_palm', {
        RgbImage: rgbImage(imageB64),
      });

      // The published contract does not say how "nobody matched" is expressed.
      // An empty UserId is treated as a clean no-match rather than an error; if a
      // gallery miss turns out to arrive as a non-zero `code` instead, it will
      // surface as a PalmProviderError and show up in palm_audit with that code,
      // which is exactly where you would look. Revisit once observed against the
      // real service.
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

      return { meta: { requestId } };
    },
  };
}
