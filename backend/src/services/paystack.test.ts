import {beforeEach, describe, expect, it, vi} from 'vitest';
const settings = vi.hoisted(() => ({PAYSTACK_MODE: 'test', PAYSTACK_SECRET_KEY: undefined as string | undefined, CARD_TOKEN_ENCRYPTION_KEY: undefined as string | undefined}));
vi.mock('../config.js', () => ({config: settings}));
import {requirePaystack} from './paystack.js';
beforeEach(() => {settings.PAYSTACK_MODE='test';settings.PAYSTACK_SECRET_KEY=undefined;settings.CARD_TOKEN_ENCRYPTION_KEY=undefined;});
describe('payment configuration errors', () => {
  it.each(['both', 'secret', 'encryption'])('identifies card payments when %s configuration is missing', missing => {
    if(missing==='secret')settings.CARD_TOKEN_ENCRYPTION_KEY=Buffer.alloc(32).toString('base64');
    if(missing==='encryption')settings.PAYSTACK_SECRET_KEY='sk_test_fixture';
    expect(() => requirePaystack('payment')).toThrow(expect.objectContaining({status:503,code:'card_payment_not_configured'}));
  });
  it('preserves the card-linking error for hosted checkout callers', () => {
    expect(() => requirePaystack()).toThrow(expect.objectContaining({code:'card_link_not_configured'}));
  });
  it('rejects a mismatched key before charging', () => {
    settings.PAYSTACK_SECRET_KEY='sk_live_fixture';settings.CARD_TOKEN_ENCRYPTION_KEY=Buffer.alloc(32).toString('base64');
    expect(() => requirePaystack('payment')).toThrow(expect.objectContaining({code:'payment_mode_mismatch'}));
  });
  it('accepts a configured matching live environment', () => {
    settings.PAYSTACK_MODE='live';settings.PAYSTACK_SECRET_KEY='sk_live_fixture';settings.CARD_TOKEN_ENCRYPTION_KEY=Buffer.alloc(32).toString('base64');
    expect(() => requirePaystack('payment')).not.toThrow();
  });
  it('accepts a configured matching test environment', () => {
    settings.PAYSTACK_SECRET_KEY='sk_test_fixture';settings.CARD_TOKEN_ENCRYPTION_KEY=Buffer.alloc(32).toString('base64');
    expect(() => requirePaystack('payment')).not.toThrow();
  });
});
