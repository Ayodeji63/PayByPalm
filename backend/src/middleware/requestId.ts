/**
 * Request id + request-scoped logger.
 *
 * Every request gets an id, echoed back as `x-request-id`. When a terminal reports
 * a failure the operator can read that id off the screen, and it ties together
 * every log line for that request — including the palm provider call.
 */

import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { logger } from '../logger.js';
import type { Logger } from '../logger.js';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      id: string;
      log: Logger;
    }
  }
}

export function requestId(req: Request, res: Response, next: NextFunction): void {
  // Honour an upstream id when there is one, so a trace survives a proxy hop.
  const incoming = req.header('x-request-id');
  req.id = incoming && incoming.length <= 200 ? incoming : randomUUID();
  req.log = logger.child({ requestId: req.id });
  res.setHeader('x-request-id', req.id);

  const startedAt = Date.now();
  res.on('finish', () => {
    req.log.info(
      {
        method: req.method,
        path: req.path,
        status: res.statusCode,
        durationMs: Date.now() - startedAt,
      },
      'request',
    );
  });

  next();
}
