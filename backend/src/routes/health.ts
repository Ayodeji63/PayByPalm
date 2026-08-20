/**
 * Health check.
 *
 * Reports which palm provider is live, because "why did matching stop working?"
 * is nearly always "it is running on mock" or the reverse. Reveals no secrets.
 */

import { Router } from 'express';
import { config } from '../config.js';
import { db } from '../db/client.js';

export const healthRouter: Router = Router();

healthRouter.get('/health', async (_req, res) => {
  // Cheap round-trip that proves the database is reachable and the service role
  // key is valid, without reading anything sensitive.
  const started = Date.now();
  const { error } = await db.from('merchants').select('id', { count: 'exact', head: true });

  const dbOk = !error;

  res.status(dbOk ? 200 : 503).json({
    status: dbOk ? 'ok' : 'degraded',
    palmProvider: config.PALM_PROVIDER,
    database: { ok: dbOk, latencyMs: Date.now() - started },
    uptimeSeconds: Math.round(process.uptime()),
  });
});
