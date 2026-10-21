/** Email/password signup, email verification and wallet sessions. */
import { Router } from 'express';
import { z } from 'zod/v3';
import { identityService } from '../auth/service.js';
import { userAuth } from '../middleware/userAuth.js';
import { config } from '../config.js';
import { unauthorized } from '../errors.js';
import { normalisePhone } from '../lib/phone.js';
import { ipRateLimit, rateLimit } from '../middleware/abuseLimits.js';
import { validate } from '../middleware/validate.js';

export const authRouter: Router = Router();
const emailSchema = z.string().trim().toLowerCase().email('Enter a valid email address').max(254)
  .refine(email => !email.endsWith('@phone.paybypalm.local'), 'Use an email address you can receive mail at');
const signupSchema = z.object({ fullName: z.string().trim().min(2).max(120), email: emailSchema,
  phone: z.string().min(7).max(32), password: z.string().min(8).max(200) });
const loginSchema = z.object({ email: emailSchema, password: z.string().min(1).max(200) });
const dev = config.NODE_ENV === 'development';

authRouter.post('/auth/signup', validate({ body: signupSchema }),
  ipRateLimit('signup-ip', dev ? 300 : 60, 3600),
  rateLimit('signup-email', dev ? 30 : 5, 3600, req => req.body.email), async (req, res) => {
    const input = req.body as z.infer<typeof signupSchema>;
    await identityService.signup({ ...input, phone: normalisePhone(input.phone) });
    res.status(201).json({ email: input.email, verificationRequired: true });
  });

const tokenSchema = z.string().min(1).max(4096);
// Verification is an explicit POST. Merely opening an email cannot sign anyone in.
authRouter.post('/auth/confirm', ipRateLimit('email-confirm-ip', 20, 900),
  validate({ body: z.object({ token: tokenSchema }) }),
  rateLimit('email-confirm-token', 5, 900, req => req.body.token), async (req, res) => {
    await identityService.confirm(req.body.token);
    res.json({ verified: true });
  });

authRouter.post('/auth/resend-confirmation', ipRateLimit('otp-send-ip', 5, 3600),
  validate({ body: z.object({ email: emailSchema }) }),
  rateLimit('otp-send-email', 1, 60, req => req.body.email),
  rateLimit('otp-send-email-hour', 5, 3600, req => req.body.email), async (req, res) => {
    await identityService.resend(req.body.email);
    res.json({ sent: true });
  });

authRouter.post('/auth/login', ipRateLimit('login-ip', 20, 300), validate({ body: loginSchema }),
  rateLimit('login-email', 10, 900, req => req.body.email), async (req, res) => {
    res.json(await identityService.login(req.body.email, req.body.password));
  });

authRouter.post('/auth/refresh', ipRateLimit('refresh-ip', 60, 300),
  validate({ body: z.object({ refreshToken: tokenSchema }) }),
  rateLimit('refresh-token', 20, 300, req => req.body.refreshToken), async (req, res) => {
    const result = await identityService.session(req.body.refreshToken);
    if (!result) throw unauthorized('Session expired. Please sign in again.');
    res.json({ session: result.session });
  });

authRouter.get('/auth/session', userAuth, (req, res) => {
  res.json({ user: { ...req.user, email_confirmed_at: new Date().toISOString() } });
});
authRouter.post('/auth/logout', validate({ body: z.object({}) }), userAuth, async (req, res) => {
  await identityService.logout(req.header('authorization')!.slice(7).trim());
  res.status(204).end();
});
authRouter.post('/auth/request-password-reset', ipRateLimit('reset-ip', 5, 3600),
  validate({ body: z.object({ email: emailSchema }) }),
  rateLimit('reset-email', 1, 60, req => req.body.email), async (req, res) => {
    await identityService.requestReset(req.body.email);
    res.json({ sent: true });
  });
authRouter.post('/auth/reset-password', ipRateLimit('reset-confirm-ip', 10, 900),
  validate({ body: z.object({ token: tokenSchema, password: z.string().min(8).max(200) }) }),
  rateLimit('reset-token', 5, 900, req => req.body.token), async (req, res) => {
    await identityService.reset(req.body.token, req.body.password);
    res.json({ reset: true });
  });
