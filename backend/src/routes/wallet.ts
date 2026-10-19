/**
 * Wallet routes — everything the phone app needs.
 *
 * All user-authenticated. Card balances are unavailable from this provider;
 * no internal stored-value balance is presented as a card balance.
 */

import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { db } from '../db/client.js';
import { AppError, unauthorized } from '../errors.js';
import { getProfile } from '../db/queries.js';
import { requireUser, userAuth } from '../middleware/userAuth.js';
import { userRateLimit } from '../middleware/abuseLimits.js';
import { validate } from '../middleware/validate.js';
import {paystackDomain} from '../services/paystack.js';

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

  res.json({
    id: profile.id,
    fullName: profile.full_name,
    email: user.email,
    phone: profile.phone ?? '',
    palmEnrolled: profile.palm_enrolled,
    hasPin: profile.pin_hash !== null,
    balanceMinor: null,
    cardBalanceAvailable: false,
    paymentSource: 'linked_card',
    paymentMode: paystackDomain(),
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

// Retired stored-value funding route. Never creates internal funds.
walletRouter.post('/topup',userAuth,(_req,_res,next)=>next(new AppError(410,'stored_value_retired','Payments debit your linked card. PayByPalm does not hold a spendable wallet balance.')));
