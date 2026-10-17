/**
 * Wallet routes — everything the phone app needs.
 *
 * All user-authenticated. Balance is always derived from the ledger; there is no
 * stored balance to return instead.
 */

import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { db } from '../db/client.js';
import { AppError, unauthorized, forbidden } from '../errors.js';
import { getProfile, getWalletAccountId, getBalanceMinor } from '../db/queries.js';
import { requireUser, userAuth } from '../middleware/userAuth.js';
import { userRateLimit } from '../middleware/abuseLimits.js';
import { validate } from '../middleware/validate.js';
import { config } from '../config.js';
import { topUp } from '../services/paymentService.js';

export const walletRouter: Router = Router();

const BCRYPT_ROUNDS = 10;

// ---------------------------------------------------------------------------
// GET /me
// ---------------------------------------------------------------------------
// Polled by the wallet app, so a payment made at a terminal shows up on the phone
// within seconds. Kept deliberately cheap: two indexed reads.

walletRouter.get('/me', userAuth, userRateLimit('user-read', 240, 60), async (req, res) => {
  const user = requireUser(req);
  const profile = await getProfile(user.id);
  const balanceMinor = await getBalanceMinor(await getWalletAccountId(user.id));

  res.json({
    id: profile.id,
    fullName: profile.full_name,
    email: user.email,
    phone: profile.phone ?? '',
    palmEnrolled: profile.palm_enrolled,
    hasPin: profile.pin_hash !== null,
    balanceMinor,
    currency: 'NGN',
    createdAt: profile.created_at,
  });
});

// ---------------------------------------------------------------------------
// POST /me/pin — change the wallet PIN
// ---------------------------------------------------------------------------

walletRouter.post(
  '/me/pin',
  userAuth,
  userRateLimit('wallet-pin', 5, 900),
  validate({
    body: z.object({
      currentPin: z.string().regex(/^\d{4}$/).optional(),
      newPin: z
        .string()
        .regex(/^\d{4}$/, 'PIN must be exactly 4 digits')
        .refine((p) => !/^(\d)\1{3}$/.test(p), 'PIN cannot be four identical digits')
        .refine((p) => p !== '1234' && p !== '0000', 'Choose a less predictable PIN'),
    }),
  }),
  async (req, res) => {
    const user = requireUser(req);
    const { currentPin, newPin } = req.body as { currentPin?: string; newPin: string };
    const profile = await getProfile(user.id);

    // A PIN already on file can only be replaced by someone who knows it. Holding
    // a valid session is not enough — the PIN is the step-up factor, so letting a
    // session rewrite it would defeat its purpose.
    if (profile.pin_hash) {
      if (!currentPin) throw unauthorized('Enter your current PIN.');
      const ok = await bcrypt.compare(currentPin, profile.pin_hash);
      if (!ok) throw unauthorized('Current PIN is incorrect.');
    }

    let update = db.from('profiles')
      .update({ pin_hash: await bcrypt.hash(newPin, BCRYPT_ROUNDS) })
      .eq('id', user.id);
    update = profile.pin_hash ? update.eq('pin_hash', profile.pin_hash) : update.is('pin_hash', null);
    const { data, error } = await update.select('id');
    if (!error && !data?.length) {
      throw new AppError(409, 'pin_changed', 'Your PIN was already updated. Please sign in again.');
    }

    if (error) throw new AppError(500, 'db_error', `Could not update PIN: ${error.message}`);

    res.json({ updated: true });
  },
);

// ---------------------------------------------------------------------------
// POST /topup
// ---------------------------------------------------------------------------
// HACKATHON SCOPE — simulated credit from the system float account. There is no
// real money movement here and the wallet app labels it as sandbox funds.
//
// This is the seam where a real Wema funding rail plugs in: an inbound NIP or
// virtual-account webhook would verify that money actually arrived and then call
// the same post_topup() database function. The ledger shape does not change.

walletRouter.post(
  '/topup',
  (_req, _res, next) => {
    if (config.isProduction) return next(forbidden('Sandbox funding is disabled in production.'));
    next();
  },
  userAuth,
  userRateLimit('sandbox-topup', 5, 60),
  validate({
    body: z.object({
      amountMinor: z
        .number()
        .int('Amount must be a whole number of kobo')
        .positive('Amount must be greater than zero')
        .max(10_000_000, 'Demo top-ups are capped at ₦100,000'),
    }),
  }),
  async (req, res) => {
    const user = requireUser(req);
    const { amountMinor } = req.body as { amountMinor: number };

    const result = await topUp(user.id, amountMinor, 'Demo top-up');

    res.status(201).json({
      ...result,
      simulated: true,
      message: 'Sandbox funds added.',
    });
  },
);
