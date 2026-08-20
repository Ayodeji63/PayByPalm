/**
 * Palm image handling at the API boundary.
 *
 * PRIVACY RULE, and the reason this module is deliberately tiny:
 * a palm image is biometric data. It is held in memory for the duration of one
 * request, forwarded to the matching provider, and then dropped. It is never
 * written to disk, never inserted into a table, never attached to a log line, and
 * never echoed back in a response. There is no code path in this backend that
 * persists one, and there must not be.
 */

import { badRequest } from '../errors.js';
import { config } from '../config.js';

/** `data:image/jpeg;base64,` and friends. */
const DATA_URL_PREFIX = /^data:image\/[a-zA-Z+.-]+;base64,/;

/** Base64 alphabet with optional padding, nothing else. */
const BASE64_ONLY = /^[A-Za-z0-9+/]+={0,2}$/;

export interface NormalisedImage {
  /** Bare base64, no data-url prefix — the shape the provider expects. */
  data: string;
  /** Decoded size, for logging. The image itself is never logged. */
  bytes: number;
}

/**
 * Validate and normalise an inbound palm image.
 *
 * The terminal is supposed to send bare base64, but browsers produce data URLs by
 * default via `canvas.toDataURL()`, so the prefix is stripped defensively rather
 * than rejected — an operator-visible failure at a kiosk over a string prefix
 * would be an unkind way to fail.
 */
export function normaliseImage(input: string): NormalisedImage {
  const stripped = input.replace(DATA_URL_PREFIX, '').trim();

  if (stripped.length === 0) {
    throw badRequest('image_missing', 'No palm image was supplied.');
  }

  if (!BASE64_ONLY.test(stripped)) {
    throw badRequest('image_invalid', 'Palm image is not valid base64.');
  }

  // Decoded length from the encoded length: 4 base64 chars encode 3 bytes, minus
  // padding. Computed rather than decoded so an oversized payload is rejected
  // without materialising it in memory first.
  const padding = stripped.endsWith('==') ? 2 : stripped.endsWith('=') ? 1 : 0;
  const bytes = Math.floor((stripped.length * 3) / 4) - padding;

  if (bytes > config.MAX_IMAGE_BYTES) {
    throw badRequest(
      'image_too_large',
      `Palm image is ${Math.round(bytes / 1024)}KB; the limit is ${Math.round(
        config.MAX_IMAGE_BYTES / 1024,
      )}KB.`,
      { bytes, limit: config.MAX_IMAGE_BYTES },
    );
  }

  return { data: stripped, bytes };
}
