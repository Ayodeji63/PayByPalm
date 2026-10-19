import express from 'express';
import { z } from 'zod';
import { config } from '../config.js';

export const MAX_ENCODED_IMAGE = Math.ceil(config.MAX_IMAGE_BYTES / 3) * 4 + 128;
export const imageSchema = z.string().min(1, 'A palm image is required').max(MAX_ENCODED_IMAGE);
export const imageJson = express.json({ limit: MAX_ENCODED_IMAGE + 4096, inflate: false });
// Two encrypted images plus SDK metadata; authenticate and rate-limit first.
export const sdkPayloadSchema = z.object({
  captureId: z.string().uuid(),
  payload: z.string().min(1).max(MAX_ENCODED_IMAGE * 2 + 32768),
}).strict();
export const palmJson = express.json({ limit: MAX_ENCODED_IMAGE * 2 + 65536, inflate: false });
const smallJson = express.json({ limit: '16kb', inflate: false });
export const requestBody: express.RequestHandler = (req, res, next) => {
  // Image handlers authenticate and consume their own budget before parsing.
  const imageRoute = req.method === 'POST' &&
    (/^\/transactions\/[^/]+\/authenticate\/?$/.test(req.path) || /^\/enrol\/sessions\/[^/]+\/palm\/?$/.test(req.path));
  if (imageRoute) return next();
  smallJson(req, res, next);
};
