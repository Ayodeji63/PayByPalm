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

import { createServer } from 'node:http';
import cors from 'cors';
import express from 'express';
import { AppError } from './errors.js';
import { ipRateLimit } from './middleware/abuseLimits.js';
import { requestBody } from './middleware/requestBody.js';
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
import { cardsRouter } from './routes/cards.js';
import { paystackWebhookRouter } from './routes/paystackWebhook.js';
import { startCardPaymentReconciliation } from './services/cardPaymentService.js';
import { startCardReconciliation } from './services/cardLinkService.js';
import { walletRouter } from './routes/wallet.js';
import { merchantRouter } from './routes/merchant.js';

export function createApp(): express.Express {
  const app = express();

  // Default to the socket address. Trust one hop only on a verified proxy-only deployment.
  app.set('trust proxy', config.TRUST_PROXY_HOPS);
  app.disable('x-powered-by');

  app.use(requestId);
  app.use((_req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });

  app.use(
    cors({
      origin(origin, callback) {
        // No Origin header: curl, the Pi's own fetches, server-to-server. Not a
        // browser, so the same-origin policy this protects is not in play.
        if (!origin) return callback(null, true);
        if (config.corsOrigins.includes(origin)) return callback(null, true);
        return callback(new AppError(403, 'origin_not_allowed', 'Origin is not allowed.'));
      },
      credentials: true,
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Terminal-Key', 'X-Mock-User', 'X-Request-Id'],
      exposedHeaders: ['X-Request-Id'],
    }),
  );

  app.use(ipRateLimit('requests', 300, 60));
  app.use(paystackWebhookRouter);
  app.use(requestBody);

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
  app.use(merchantRouter);
  app.use(cardsRouter);
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

  const stopCardReconciliation = startCardReconciliation();
  const stopCardPayments = startCardPaymentReconciliation();
  const server = createServer(app);
  server.on('error', (error: NodeJS.ErrnoException) => {
    logger.fatal({ code: error.code, port: config.PORT }, error.code === 'EADDRINUSE'
      ? 'API port is already in use. Stop the existing backend or choose another PORT.'
      : 'API could not start.');
    process.exit(1);
  });
  server.listen(config.PORT, '0.0.0.0', () => {
    logger.info(
      {
        port: config.PORT,
        host: '0.0.0.0',
        env: config.NODE_ENV,
        palmProvider: config.PALM_PROVIDER,
        palmCaptureMode: config.PALM_PROVIDER === 'tencent' ? config.TENCENT_CAPTURE_MODE : 'legacy',
        acceptScore: config.PALM_ACCEPT_SCORE,
        stepUpScore: config.PALM_STEP_UP_SCORE,
      },
      'PayByPalm API listening',
    );
  });

  const shutdown = (signal: string) => {
    logger.info({ signal }, 'shutting down');
    stopCardReconciliation();
    stopCardPayments();
    // Stop accepting new work, let in-flight payments finish, then exit.
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 10_000).unref();
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}
