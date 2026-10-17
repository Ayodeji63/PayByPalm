/**
 * Phone number handling.
 *
 * The profile phone is a self-reported lookup hint: the terminal bins on it to
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

/** Legacy synthetic identity helper for old administrative tooling/tests only.
 * New signup and login require a real, verified email address.
 */
export function syntheticEmailFor(phone: string): string {
  return `${normalisePhone(phone)}@phone.paybypalm.local`;
}

/** SMS providers expect an international number; profiles retain local canonical form. */
export function internationalPhoneFor(input: string): string {
  return `+234${normalisePhone(input).slice(1)}`;
}
