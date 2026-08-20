/**
 * Zod request validation.
 *
 * Handlers receive parsed, typed data or the request never reaches them. Failures
 * come back as a 400 with a field-by-field breakdown, which matters most at the
 * terminal, where "invalid request" on a 7-inch screen helps nobody.
 */

import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { z, type ZodTypeAny } from 'zod';
import { AppError } from '../errors.js';

export interface ValidationSchemas {
  body?: ZodTypeAny;
  params?: ZodTypeAny;
  query?: ZodTypeAny;
}

function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join('.') || '_';
    // Keep the first message per field; a cascade of messages for one input is
    // noise on a small screen.
    if (!(key in out)) out[key] = issue.message;
  }
  return out;
}

export function validate(schemas: ValidationSchemas): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      if (schemas.params) req.params = schemas.params.parse(req.params) as typeof req.params;
      if (schemas.body) req.body = schemas.body.parse(req.body);
      if (schemas.query) {
        // Express 5 makes req.query a getter, so it cannot be reassigned. Stash
        // the parsed result where handlers can reach it instead.
        res.locals.query = schemas.query.parse(req.query);
      }
      next();
    } catch (err) {
      if (err instanceof z.ZodError) {
        next(new AppError(400, 'validation_failed', 'Some fields are invalid.', fieldErrors(err)));
        return;
      }
      next(err);
    }
  };
}
