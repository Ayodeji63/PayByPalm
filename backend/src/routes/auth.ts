/** Email/password signup, email verification and wallet sessions. */
import { Router } from 'express';
import { z } from 'zod';
import { authClient } from '../db/client.js';
import { config } from '../config.js';
import { AppError, unauthorized } from '../errors.js';
import { normalisePhone } from '../lib/phone.js';
import { classifyAuthFailure } from '../lib/authFailure.js';
import { ipRateLimit, rateLimit } from '../middleware/abuseLimits.js';
import { validate } from '../middleware/validate.js';

export const authRouter: Router = Router();
const emailSchema = z.string().trim().toLowerCase().email('Enter a valid email address').max(254)
  .refine(email => !email.endsWith('@phone.paybypalm.local'), 'Use an email address you can receive mail at');
const signupSchema = z.object({ fullName: z.string().trim().min(2).max(120), email: emailSchema,
  phone: z.string().min(7).max(32), password: z.string().min(8).max(200) });
const loginSchema = z.object({ email: emailSchema, password: z.string().min(1).max(200) });
const dev = config.NODE_ENV === 'development';
// A server-owned target: callers cannot turn confirmation into an open redirect.
const emailRedirectTo = new URL('/auth/confirm', config.WALLET_BASE_URL).href;

authRouter.post('/auth/signup', validate({ body: signupSchema }),
  ipRateLimit('signup-ip', dev ? 300 : 60, 3600),
  rateLimit('signup-email', dev ? 30 : 5, 3600, req => req.body.email), async (req, res) => {
    const { fullName, phone, email, password } = req.body as z.infer<typeof signupSchema>;
    const { data, error } = await authClient.auth.signUp({ email, password,
      options: { emailRedirectTo, data: { full_name: fullName.trim(), phone: normalisePhone(phone) } } });
    if (error) {
      req.log.error({ authErrorCode: error.code ?? 'unknown', authErrorName: error.name, authStatus: error.status, authFailureCategory: classifyAuthFailure(error) }, 'Email signup failed');
      const code = error.code === 'over_email_send_rate_limit' ? 'email_delivery_limited'
        : error.code === 'email_address_not_authorized' ? 'email_delivery_restricted' : 'email_signup_unavailable';
      throw new AppError(503, code, 'Email verification is unavailable.');
    }
    if (data.session || !data.user) throw new AppError(503, 'email_confirmation_required', 'Email confirmation must be enabled.');
    res.status(201).json({ email, verificationRequired: true });
  });

// The default Supabase link verifies the email first, then returns a session
// in the browser fragment. Rotate it and check the authoritative Auth identity.
authRouter.post('/auth/confirm', ipRateLimit('email-confirm-ip', 20, 900),
  validate({ body: z.object({ refreshToken: z.string().min(1).max(4096) }) }),
  rateLimit('email-confirm-token', 5, 900, req => req.body.refreshToken), async (req, res) => {
    const { data, error } = await authClient.auth.refreshSession({ refresh_token: req.body.refreshToken });
    if (error || !data.session) throw new AppError(400, 'invalid_confirmation', 'This link is invalid or expired. Please sign in or request a new link.');
    const identity = await authClient.auth.getUser(data.session.access_token);
    const user = identity.data.user;
    if (identity.error || !user?.email_confirmed_at || !user.email ||
      !emailSchema.safeParse(user.email).success || user.id !== data.session.user.id) {
      throw new AppError(400, 'invalid_confirmation', 'Email verification could not be confirmed. Please sign in again.');
    }
    res.json({ session: { accessToken: data.session.access_token, refreshToken: data.session.refresh_token, expiresAt: data.session.expires_at } });
  });

authRouter.post('/auth/resend-confirmation', ipRateLimit('otp-send-ip', 5, 3600),
  validate({ body: z.object({ email: emailSchema }) }),
  rateLimit('otp-send-email', 1, 60, req => req.body.email),
  rateLimit('otp-send-email-hour', 5, 3600, req => req.body.email), async (req, res) => {
    const { error } = await authClient.auth.resend({ type: 'signup', email: req.body.email, options: { emailRedirectTo } });
    if (error) throw new AppError(503, 'email_send_failed', 'Could not send a new verification link. Please try again later.');
    res.json({ sent: true });
  });

authRouter.post('/auth/login', ipRateLimit('login-ip', 20, 300), validate({ body: loginSchema }),
  rateLimit('login-email', 10, 900, req => req.body.email), async (req, res) => {
    const { email, password } = req.body as z.infer<typeof loginSchema>;
    const { data, error } = await authClient.auth.signInWithPassword({ email, password });
    if (error?.code === 'email_not_confirmed') throw new AppError(403, 'email_verification_required', 'Verify your email before signing in.');
    if (error || !data.session || !data.user) throw unauthorized('Incorrect email or password.');
    if (!data.user.email_confirmed_at || data.user.email?.toLowerCase() !== email) throw new AppError(403, 'email_verification_required', 'Verify your email before signing in.');
    res.json({ user: { id: data.user.id }, session: {
      accessToken: data.session.access_token, refreshToken: data.session.refresh_token, expiresAt: data.session.expires_at,
    } });
  });

authRouter.post(
  '/auth/refresh',
  ipRateLimit('refresh-ip', 60, 300),
  validate({ body: z.object({ refreshToken: z.string().min(1).max(4096) }) }),
  rateLimit('refresh-token', 20, 300, req => req.body.refreshToken),
  async (req, res) => {
    const { refreshToken } = req.body as { refreshToken: string };
    const { data, error } = await authClient.auth.refreshSession({ refresh_token: refreshToken });

    if (error || !data.session) throw unauthorized('Session expired. Please sign in again.');

    res.json({
      session: {
        accessToken: data.session.access_token,
        refreshToken: data.session.refresh_token,
        expiresAt: data.session.expires_at,
      },
    });
  },
);
