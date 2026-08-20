/**
 * Deterministic in-memory palm provider.
 *
 * The point of this file: PayByPalm can be built, tested, and demoed end to end
 * with no Tencent account, no API key, and no network. `PALM_PROVIDER=mock` is the
 * whole switch. That removes the single biggest schedule risk in a 48-hour build —
 * waiting on third-party credentials — and makes the payment flow testable in CI.
 *
 * HOW IT DECIDES WHOSE PALM IT IS SEEING
 *
 * A mock has no eyes, so the identity must be supplied. Two ways, checked in order:
 *
 *   1. An `X-Mock-User: <uuid>` request header, carried to here by mockContext.
 *   2. A user id embedded in the "image" itself — post `mock:<uuid>` (base64
 *      encoded) as the image and the mock will read it. Useful in tests and curl
 *      examples, where setting a header is more ceremony than the payload.
 *
 * Scores come from MOCK_PALM_SCORE, so the accept / step_up / reject branches of
 * the match policy can each be exercised on demand: set it to 92, 78, or 50.
 */

import { config } from '../config.js';
import { logger } from '../logger.js';
import { currentMockContext } from './mockContext.js';
import type { CompareResult, PalmProvider, RegisterResult, SearchResult } from './provider.js';

/** userId -> palmId. Process-local; resets on restart, which is fine for a mock. */
const gallery = new Map<string, string>();

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

/** Score returned for a palm that is definitively not the requested user. */
const NON_MATCH_SCORE = 12;

/**
 * Work out which user this image is meant to represent.
 * Returns null when there is no hint at all — the mock then behaves as if it
 * simply did not recognise the palm.
 */
function resolveIdentity(imageB64: string): string | null {
  const fromHeader = currentMockContext().mockUserId;
  if (fromHeader) return fromHeader;

  // Try reading a uuid out of the payload. A real JPEG will not decode to
  // anything matching, so this is safe to attempt unconditionally.
  try {
    const decoded = Buffer.from(imageB64, 'base64').toString('utf8');
    const found = decoded.match(UUID);
    if (found) return found[0];
  } catch {
    // Not text. Perfectly normal for an actual image.
  }
  return null;
}

export function createMockProvider(): PalmProvider {
  return {
    name: 'mock',

    async register(userId: string): Promise<RegisterResult> {
      const palmId = `mock_palm_${userId.slice(0, 8)}_${Date.now().toString(36)}`;
      gallery.set(userId, palmId);
      logger.debug({ userId, palmId, gallerySize: gallery.size }, 'mock palm registered');
      return { palmId, meta: { requestId: `mock-${Date.now().toString(36)}`, providerIsMatch: true } };
    },

    async compare(userId: string, imageB64: string): Promise<CompareResult> {
      const seen = resolveIdentity(imageB64);
      const isSamePerson = seen !== null && seen === userId && gallery.has(userId);
      const score = isSamePerson ? config.MOCK_PALM_SCORE : NON_MATCH_SCORE;

      return {
        isMatch: isSamePerson,
        score,
        meta: { requestId: `mock-${Date.now().toString(36)}`, providerIsMatch: isSamePerson },
      };
    },

    async search(imageB64: string): Promise<SearchResult | null> {
      const seen = resolveIdentity(imageB64);

      // Unknown palm, or a known person who never enrolled: no match. This is a
      // legitimate answer, not a failure.
      if (seen === null || !gallery.has(seen)) return null;

      return {
        userId: seen,
        score: config.MOCK_PALM_SCORE,
        meta: { requestId: `mock-${Date.now().toString(36)}`, providerIsMatch: true },
      };
    },
  };
}

/** Test helper: forget every enrolment. Not used by the running server. */
export function __resetMockGallery(): void {
  gallery.clear();
}
