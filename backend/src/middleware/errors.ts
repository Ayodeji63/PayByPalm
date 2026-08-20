/**
 * Error handling.
 *
 * Two rules:
 *   1. Anything we threw deliberately (AppError) becomes its own status and code.
 *   2. Anything else becomes a generic 500. Unexpected errors are logged in full
 *      but never described to the caller — an internal message is exactly the kind
 *      of thing that leaks a table name or a key.
 */

import type { NextFunction, Request, Response } from 'express';
import { AppError, PalmProviderError } from '../errors.js';

export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({
    error: { code: 'not_found', message: `No route for ${req.method} ${req.path}` },
    requestId: req.id,
  });
}

export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  // Express identifies an error handler by its four-parameter signature, so this
  // must stay even though it is unused.
  _next: NextFunction,
): void {
  if (err instanceof AppError) {
    // Provider failures are worth a louder log — they usually mean the palm
    // service is down or the key is wrong, and both need someone to look.
    const level = err instanceof PalmProviderError ? 'error' : err.status >= 500 ? 'error' : 'warn';
    req.log[level]({ err, code: err.code, status: err.status }, 'request failed');

    res.status(err.status).json({
      error: {
        code: err.code,
        message: err.message,
        ...(err.details ? { details: err.details } : {}),
      },
      requestId: req.id,
    });
    return;
  }

  req.log.error({ err }, 'unhandled error');

  res.status(500).json({
    error: {
      code: 'internal_error',
      message: 'Something went wrong. Please try again.',
    },
    requestId: req.id,
  });
}
