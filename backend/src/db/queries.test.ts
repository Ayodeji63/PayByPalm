/**
 * Masking rules for what a terminal screen is allowed to show.
 *
 * A till is a public place. Someone standing behind the payer can read the
 * screen, so it shows enough for the payer to recognise themselves and no more.
 */

import { describe, expect, it } from 'vitest';
import { maskBalanceMinor, maskName } from './queries.js';

describe('maskName', () => {
  it('shows the first name and a last initial', () => {
    expect(maskName('Samson Olusanya')).toBe('Samson O.');
    expect(maskName('Ada Okonkwo')).toBe('Ada O.');
  });

  it('uses the final name when there are middle names', () => {
    expect(maskName('Ada Ngozi Okonkwo')).toBe('Ada O.');
  });

  it('handles a single name', () => {
    expect(maskName('Ada')).toBe('Ada');
  });

  it('tolerates messy whitespace', () => {
    expect(maskName('  Ada   Okonkwo  ')).toBe('Ada O.');
  });

  it('falls back rather than rendering an empty label', () => {
    expect(maskName('')).toBe('Customer');
    expect(maskName('   ')).toBe('Customer');
  });

  it('never returns the full surname', () => {
    expect(maskName('Samson Olusanya')).not.toContain('Olusanya');
  });
});

describe('maskBalanceMinor', () => {
  it('rounds down to the nearest 100 naira', () => {
    expect(maskBalanceMinor(1_234_56)).toBe(1_200_00);
    expect(maskBalanceMinor(2_000_000)).toBe(2_000_000);
  });

  it('never rounds up, so it cannot overstate what someone can afford', () => {
    expect(maskBalanceMinor(999_99)).toBe(900_00);
  });

  it('does not go negative', () => {
    expect(maskBalanceMinor(0)).toBe(0);
    expect(maskBalanceMinor(-500)).toBe(0);
  });

  it('shows zero for a balance under 100 naira', () => {
    expect(maskBalanceMinor(50_00)).toBe(0);
  });
});
