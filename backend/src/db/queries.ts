/**
 * Shared database reads.
 *
 * Balance is read here and only here, always through the `account_balances` view.
 * There is no balance column to read instead — see supabase/README.md.
 */

import { db } from './client.js';
import { AppError, notFound } from '../errors.js';

export interface Profile {
  id: string;
  full_name: string;
  phone: string;
  phone_last4: string;
  pin_hash: string | null;
  palm_enrolled: boolean;
  created_at: string;
}

/** Turn a Supabase error into a 500 rather than letting a null slip through. */
function orThrow<T>(data: T | null, error: { message: string } | null, what: string): T {
  if (error) throw new AppError(500, 'db_error', `Could not load ${what}: ${error.message}`);
  if (data === null) throw notFound(`${what} not found`);
  return data;
}

export async function getProfile(userId: string): Promise<Profile> {
  const { data, error } = await db
    .from('profiles')
    .select('id, full_name, phone, phone_last4, pin_hash, palm_enrolled, created_at')
    .eq('id', userId)
    .maybeSingle();
  return orThrow(data as Profile | null, error, 'profile');
}

export async function getWalletAccountId(userId: string): Promise<string> {
  const { data, error } = await db
    .from('accounts')
    .select('id')
    .eq('user_id', userId)
    .eq('kind', 'user')
    .maybeSingle();
  const row = orThrow(data as { id: string } | null, error, 'wallet account');
  return row.id;
}

/**
 * Derived balance in minor units (kobo).
 *
 * An account with no ledger entries reports 0 — the view LEFT JOINs for exactly
 * that reason, so a brand-new wallet is 0 rather than missing.
 */
export async function getBalanceMinor(accountId: string): Promise<number> {
  const { data, error } = await db
    .from('account_balances')
    .select('balance_minor')
    .eq('account_id', accountId)
    .maybeSingle();
  const row = orThrow(data as { balance_minor: number } | null, error, 'balance');
  return Number(row.balance_minor);
}

export async function getWalletBalanceMinor(userId: string): Promise<number> {
  return getBalanceMinor(await getWalletAccountId(userId));
}

/**
 * Candidates for a last4-binned payment: enrolled users whose phone ends in these
 * four digits. This is what turns a 1:N search into a handful of 1:1 comparisons.
 */
export async function getCandidatesByLast4(last4: string): Promise<Profile[]> {
  const { data, error } = await db
    .from('profiles')
    .select('id, full_name, phone, phone_last4, pin_hash, palm_enrolled, created_at')
    .eq('phone_last4', last4)
    .eq('palm_enrolled', true)
    // Deterministic order, so a repeated request compares candidates in the same
    // sequence and an operator sees consistent behaviour.
    .order('created_at', { ascending: true });

  if (error) throw new AppError(500, 'db_error', `Could not load candidates: ${error.message}`);
  return (data ?? []) as Profile[];
}

/**
 * "Samson Olusanya" -> "Samson O."
 *
 * Terminals show this instead of a full name. Enough for the payer to recognise
 * themselves, not enough for a bystander to learn who is standing at the till.
 */
export function maskName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'Customer';
  const [first, ...rest] = parts;
  const last = rest.at(-1);
  return last ? `${first} ${last[0]!.toUpperCase()}.` : first!;
}

/**
 * Balance shown on a terminal screen, rounded down to the nearest ₦100.
 *
 * The payer needs to know they can cover the bill; the cashier watching the same
 * screen does not need their exact balance.
 */
export function maskBalanceMinor(balanceMinor: number): number {
  const hundredNaira = 100 * 100;
  return Math.max(0, Math.floor(balanceMinor / hundredNaira) * hundredNaira);
}
