/**
 * Phone number handling.
 *
 * The phone number is the identity anchor: it is what the terminal bins on to
 * narrow a palm search. Two users who type the same number differently must end
 * up with the same stored value, or the bin lookup silently misses.
 */

import { badRequest } from '../errors.js';

/**
 * Reduce a Nigerian mobile number to a canonical local form: 11 digits, leading 0.
 *
 *   +234 801 000 1234 -> 08010001234
 *   234 801 000 1234  -> 08010001234
 *   0801 000 1234     -> 08010001234
 *   801 000 1234      -> 08010001234
 */
export function normalisePhone(input: string): string {
  const digits = input.replace(/\D/g, '');

  let local = digits;
  if (local.startsWith('234')) local = `0${local.slice(3)}`;
  else if (local.length === 10) local = `0${local}`;

  if (!/^0\d{10}$/.test(local)) {
    throw badRequest(
      'invalid_phone',
      'Enter a valid Nigerian mobile number, e.g. 08010001234.',
    );
  }

  return local;
}

/**
 * Supabase Auth needs an email address, and the wallet signup form deliberately
 * does not ask for one — phone is the anchor.
 *
 * HACKATHON SHORTCUT: a synthetic address is derived from the phone number so
 * Supabase has something to key on. It is never sent to, and never receives,
 * anything; accounts are created with email_confirm already set. A production
 * build would use Supabase's phone auth with a real SMS provider instead.
 */
export function syntheticEmailFor(phone: string): string {
  return `${normalisePhone(phone)}@phone.paybypalm.local`;
}
