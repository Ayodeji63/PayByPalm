/**
 * Structured JSON logging.
 *
 * Redaction is configured centrally rather than trusted to call sites. The paths
 * below cover the two things that must never reach a log line: the palm image and
 * any credential. A palm image is biometric data — logging it once, anywhere,
 * turns a log aggregator into a biometric database.
 */

import pino from 'pino';
import { config } from './config.js';

export const logger = pino({
  level: config.LOG_LEVEL,
  redact: {
    paths: [
      'imageB64',
      '*.imageB64',
      'req.body.imageB64',
      'body.imageB64',
      'RgbImage',
      '*.RgbImage',
      'RgbImage.Data',
      'req.headers.authorization',
      'req.headers["x-terminal-key"]',
      'pin',
      '*.pin',
      'password',
      '*.password',
      'pin_hash',
      '*.pin_hash',
    ],
    censor: '[redacted]',
  },
  // Pretty output locally; raw JSON in production where a log shipper consumes it.
  ...(config.isProduction
    ? {}
    : { transport: { target: 'pino/file', options: { destination: 1 } } }),
});

export type Logger = typeof logger;
