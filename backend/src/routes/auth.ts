/**
 * Authentication routes.
 *
 * Supabase Auth owns credentials. This module's job is to create the auth user
 * with the metadata the handle_new_user() trigger needs, and to hash the wallet
 * PIN — which the trigger deliberately does not do, because a SQL trigger has no
 * safe way to hash a secret.
 */

import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { authClient, db } from '../db/client.js';
import { AppError, conflict, unauthorized } from '../errors.js';
import { normalisePhone, syntheticEmailFor } from '../lib/phone.js';
import { validate } from '../middleware/validate.js';

export const authRouter: Router = Router();

/** Cost 10: comfortably slow for a 4-digit PIN, fast enough not to stall a till. */
const BCRYPT_ROUNDS = 10;

const pinSchema = z
  .string()
  .regex(/^\d{4}$/, 'PIN must be exactly 4 digits')
  // Reject the PINs an attacker tries first. A 4-digit space is small enough that
  // this is worth doing.
  .refine((p) => !/^(\d)\1{3}$/.test(p), 'PIN cannot be four identical digits')
  .refine((p) => p !== '1234' && p !== '0000', 'Choose a less predictable PIN');

const signupSchema = z.object({
  fullName: z.string().trim().min(2, 'Enter your full name').max(120),
  phone: z.string().min(7, 'Enter your phone number'),
  password: z.string().min(8, 'Password must be at least 8 characters').max(200),
  pin: pinSchema,
});

const loginSchema = z.object({
  phone: z.string().min(7, 'Enter your phone number'),
  password: z.string().min(1, 'Enter your password'),
});

// ---------------------------------------------------------------------------
// POST /auth/signup
// ---------------------------------------------------------------------------

authRouter.post('/auth/signup', validate({ body: signupSchema }), async (req, res) => {
  const { fullName, phone, password, pin } = req.body as z.infer<typeof signupSchema>;
  const normalisedPhone = normalisePhone(phone);
  const email = syntheticEmailFor(normalisedPhone);

  // full_name and phone go in as user metadata because handle_new_user() reads
  // them from there to build the profile and its wallet account. It raises if
  // either is missing, so this is not optional.
  const { data, error } = await db.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName.trim(), phone: normalisedPhone },
  });

  if (error) {
    const message = error.message.toLowerCase();
    if (message.includes('already') || message.includes('registered') || message.includes('duplicate')) {
      throw conflict('phone_taken', 'An account already exists for this phone number.');
    }
    req.log.error({ err: error }, 'signup failed');
    throw new AppError(400, 'signup_failed', error.message);
  }

  const userId = data.user?.id;
  if (!userId) throw new AppError(500, 'signup_failed', 'Account was not created.');

  // The profile row already exists — the trigger made it. Add the PIN hash.
  const { error: pinError } = await db
    .from('profiles')
    .update({ pin_hash: await bcrypt.hash(pin, BCRYPT_ROUNDS) })
    .eq('id', userId);

  if (pinError) {
    req.log.error({ err: pinError, userId }, 'could not store PIN hash');
    throw new AppError(500, 'signup_failed', 'Account created but the PIN could not be saved.');
  }

  // Sign in immediately so the app does not have to ask for the password again.
  const { data: session, error: signInError } = await authClient.auth.signInWithPassword({
    email,
    password,
  });

  if (signInError || !session.session) {
    throw new AppError(500, 'signin_failed', 'Account created — please sign in.');
  }

  res.status(201).json({
    user: { id: userId, fullName: fullName.trim(), phone: normalisedPhone },
    session: {
      accessToken: session.session.access_token,
      refreshToken: session.session.refresh_token,
      expiresAt: session.session.expires_at,
    },
  });
});

// ---------------------------------------------------------------------------
// POST /auth/login
// ---------------------------------------------------------------------------

authRouter.post('/auth/login', validate({ body: loginSchema }), async (req, res) => {
  const { phone, password } = req.body as z.infer<typeof loginSchema>;
  const email = syntheticEmailFor(phone);

  const { data, error } = await authClient.auth.signInWithPassword({ email, password });

  if (error || !data.session || !data.user) {
    // One message for both "no such account" and "wrong password", so this cannot
    // be used to discover which phone numbers are registered.
    throw unauthorized('Incorrect phone number or password.');
  }

  res.json({
    user: { id: data.user.id },
    session: {
      accessToken: data.session.access_token,
      refreshToken: data.session.refresh_token,
      expiresAt: data.session.expires_at,
    },
  });
});

// ---------------------------------------------------------------------------
// POST /auth/refresh
// ---------------------------------------------------------------------------

authRouter.post(
  '/auth/refresh',
  validate({ body: z.object({ refreshToken: z.string().min(1) }) }),
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
