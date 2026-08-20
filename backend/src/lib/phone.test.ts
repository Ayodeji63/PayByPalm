import { describe, expect, it } from 'vitest';
import { normalisePhone, syntheticEmailFor } from './phone.js';

describe('normalisePhone', () => {
  it('canonicalises every common way of writing the same number', () => {
    // All of these must land on one value, or two users typing the same number
    // differently would end up in different terminal bins.
    const forms = [
      '08010001234',
      '0801 000 1234',
      '0801-000-1234',
      '+2348010001234',
      '2348010001234',
      '+234 801 000 1234',
      '8010001234',
    ];
    for (const form of forms) {
      expect(normalisePhone(form)).toBe('08010001234');
    }
  });

  it('produces a last4 that matches the database generated column', () => {
    // profiles.phone_last4 is `right(phone, 4)`.
    expect(normalisePhone('+2348010001234').slice(-4)).toBe('1234');
  });

  it('rejects numbers that are too short or too long', () => {
    expect(() => normalisePhone('0801000')).toThrow(/valid Nigerian mobile/);
    expect(() => normalisePhone('080100012345678')).toThrow(/valid Nigerian mobile/);
  });

  it('rejects input with no digits', () => {
    expect(() => normalisePhone('not a phone')).toThrow();
  });
});

describe('syntheticEmailFor', () => {
  it('is stable across input formats', () => {
    expect(syntheticEmailFor('+234 801 000 1234')).toBe(syntheticEmailFor('08010001234'));
  });

  it('uses a non-routable domain', () => {
    // Nothing is ever sent to this address; accounts are created pre-confirmed.
    expect(syntheticEmailFor('08010001234')).toMatch(/\.local$/);
  });
});
