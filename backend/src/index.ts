/**
 * PayByPalm API.
 *
 * Two authentication planes, kept strictly apart:
 *   - the wallet app, holding a Supabase user JWT
 *   - terminals, holding a device key
 *
 * And one thing that never leaves this process: the palm provider credential. The
 * Pi posts an image to us; we call the provider. See src/palm/tencent.ts.
 */

import cors from 'cors';
import express from 'express';
import { config } from './config.js';
import { logger } from './logger.js';
import { errorHandler, notFoundHandler } from './middleware/errors.js';
import { requestId } from './middleware/requestId.js';
import { runWithMockContext } from './palm/mockContext.js';
import { authRouter } from './routes/auth.js';
import { enrolRouter } from './routes/enrol.js';
import { healthRouter } from './routes/health.js';
import { terminalRouter } from './routes/terminal.js';
import { transactionsRouter } from './routes/transactions.js';
import { walletRouter } from './routes/wallet.js';

export function createApp(): express.Express {
  const app = express();

  // Render and Vercel both sit behind a proxy; without this, client IPs and
  // protocol detection are wrong.
  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  app.use(
    cors({
      origin(origin, callback) {
        // No Origin header: curl, the Pi's own fetches, server-to-server. Not a
        // browser, so the same-origin policy this protects is not in play.
        if (!origin) return callback(null, true);
        if (config.corsOrigins.includes(origin)) return callback(null, true);
        return callback(new Error(`Origin ${origin} is not allowed`));
      },
      credentials: true,
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Terminal-Key', 'X-Mock-User', 'X-Request-Id'],
      exposedHeaders: ['X-Request-Id'],
    }),
  );

  // Palm images arrive as base64, which inflates by about a third. The real limit
  // is MAX_IMAGE_BYTES, enforced with a precise message in lib/image.ts; this
  // ceiling just stops an absurd payload from being buffered at all.
  app.use(express.json({ limit: '12mb' }));

  app.use(requestId);

  // Carries the X-Mock-User hint to the mock palm provider without widening the
  // provider interface. A no-op when the real provider is running.
  app.use((req, _res, next) => {
    const mockUserId = req.header('x-mock-user');
    if (config.PALM_PROVIDER === 'mock' && mockUserId) {
      runWithMockContext({ mockUserId }, next);
      return;
    }
    next();
  });

  app.use(healthRouter);
  app.use(authRouter);
  app.use(walletRouter);
  app.use(terminalRouter);
  app.use(enrolRouter);
  app.use(transactionsRouter);

  app.use(notFoundHandler);
  // Express 5 forwards rejections from async handlers here automatically, so no
  // per-route try/catch is needed.
  app.use(errorHandler);

  return app;
}

// Only listen when run directly; tests import createApp() instead.
if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  const app = createApp();

  const server = app.listen(config.PORT, () => {
    logger.info(
      {
        port: config.PORT,
        env: config.NODE_ENV,
        palmProvider: config.PALM_PROVIDER,
        acceptScore: config.PALM_ACCEPT_SCORE,
        stepUpScore: config.PALM_STEP_UP_SCORE,
      },
      'PayByPalm API listening',
    );
  });

  const shutdown = (signal: string) => {
    logger.info({ signal }, 'shutting down');
    // Stop accepting new work, let in-flight payments finish, then exit.
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 10_000).unref();
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}
