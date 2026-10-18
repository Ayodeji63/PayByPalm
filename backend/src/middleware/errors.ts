import type { NextFunction, Request, Response } from 'express';
import { AppError, PalmProviderError } from '../errors.js';
import { logger } from '../logger.js';

export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({ error: { code: 'not_found', message: 'Route not found.' }, requestId: req.id });
}

export function errorHandler(err: unknown, req: Request, res: Response, next: NextFunction): void {
  const log = req.log ?? logger;
  if (res.headersSent) { next(err); return; }
  // Parser errors may contain the raw request body in their message/body fields.
  // Log only a safe classification, never the parser's error object.
  const type = (err as { type?: string } | null)?.type;
  const parserErrors: Record<string, [number, string, string]> = {
    'entity.parse.failed': [400, 'invalid_json', 'Request body must be valid JSON.'],
    'entity.too.large': [413, 'body_too_large', 'Request body is too large.'],
    'encoding.unsupported': [415, 'unsupported_encoding', 'Compressed request bodies are not supported.'],
    'charset.unsupported': [415, 'unsupported_charset', 'Use UTF-8 JSON.'],
    'request.aborted': [400, 'request_aborted', 'Request body was interrupted.'],
    'request.size.invalid': [400, 'invalid_body_size', 'Request body length is invalid.'],
  };
  if (type && parserErrors[type]) {
    const [status, code, message] = parserErrors[type]!;
    log.warn({ code, status }, 'invalid request body');
    res.status(status).json({ error: { code, message }, requestId: req.id });
    return;
  }
  // Observed Tencent duplicate-binding response. Never turn it into a forced
  // rebind: the existing template's owner must be reconciled by an administrator.
  if(err instanceof PalmProviderError&&err.providerCode===2080007){
    log.warn({providerCode:err.providerCode,providerRequestId:err.requestId},'palm registration conflict');
    res.status(409).json({error:{code:'palm_already_bound',message:'This palm is already registered with the palm service. Use its linked account or contact support to reconcile the previous registration.'},requestId:req.id});
    return;
  }
  if (err instanceof AppError) {
    const level = err instanceof PalmProviderError || err.status >= 500 ? 'error' : 'warn';
    log[level]({ err, code: err.code, status: err.status }, 'request failed');
    const privateError = err.status >= 500 || err.code === 'signup_failed';
    const publicSignupErrors: Record<string, string> = {
      payment_setup_required: 'Sales are unavailable until the administrator applies the terminal sale recovery database update.',
      card_link_not_configured: 'Card linking is not configured yet. Please contact support.',
      card_storage_unavailable: 'Card storage is unavailable. Please try again later.',
      payment_service_unavailable: 'The payment service could not confirm this request. Check its status before trying again.',
      card_checkout_failed: 'Checkout could not be opened. Check your recent linking requests before trying again.',
      invalid_checkout: 'Payment checkout could not be opened. Please try again later.',
      email_delivery_limited: 'The email service is limiting verification messages. Please try later or contact support.',
      email_delivery_restricted: 'Verification email is not available for this address yet. Please contact support.',
      email_signup_unavailable: 'We could not send a confirmation email. Please try again later or contact support.',
      email_confirmation_required: 'Email verification needs to be configured. Please contact support.',
      email_send_failed: 'We could not send a new confirmation link. Please try again later.',
      link_completion_failed: 'We could not finish sign-in. Please request a new link.',
      signup_completion_failed: 'Your email is verified. Please sign in, or request a new confirmation link to finish setup.',
      pin_setup_failed: 'Your email is verified, but PIN setup failed. Please request a new confirmation link to finish setup.',
    };
    const message = publicSignupErrors[err.code] ?? (err instanceof PalmProviderError ? 'Palm service is unavailable. Please try again.'
      : privateError ? 'Unable to complete the request. Please try again.' : err.message);
    if (err.status === 429) res.setHeader('Retry-After', String(err.details?.retryAfter ?? 60));
    res.status(err.status).json({
      error: { code: err.code, message, ...(!privateError && err.details ? { details: err.details } : {}) },
      requestId: req.id,
    });
    return;
  }
  log.error({ err }, 'unhandled error');
  res.status(500).json({ error: { code: 'internal_error', message: 'Unable to complete the request. Please try again.' }, requestId: req.id });
}
