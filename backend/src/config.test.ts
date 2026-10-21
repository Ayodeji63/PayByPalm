import { describe, expect, it } from 'vitest';
import { configSchema } from './config.js';

describe('production payment configuration', () => {
  it('defaults to the original camera and requires an explicit H5 opt-in', () => {
    const env = {...process.env, TENCENT_CAPTURE_MODE: undefined};
    const original = configSchema.safeParse(env);
    expect(original.success).toBe(true);
    if (original.success) expect(original.data.TENCENT_CAPTURE_MODE).toBe('legacy');
    const h5 = configSchema.safeParse({...env, TENCENT_CAPTURE_MODE: 'h5'});
    expect(h5.success).toBe(true);
    if (h5.success) expect(h5.data.TENCENT_CAPTURE_MODE).toBe('h5');
    expect(configSchema.safeParse({...env, TENCENT_CAPTURE_MODE: 'typo'}).success).toBe(false);
  });
  it('refuses mock authorization in production', () => {
    const result = configSchema.safeParse({ ...process.env, NODE_ENV: 'production', PALM_PROVIDER: 'mock' });
    expect(result.success).toBe(false);
  });
  it('allows a configured real provider in production', () => {
    const result = configSchema.safeParse({ ...process.env, NODE_ENV: 'production', PALM_PROVIDER: 'tencent', TENCENT_PALM_API_KEY: 'test-only' });
    expect(result.success).toBe(true);
  });
  it('requires an encryption key before enabling card linking', () => {
    expect(configSchema.safeParse({ ...process.env, PAYSTACK_SECRET_KEY: 'sk_test_fixture', CARD_TOKEN_ENCRYPTION_KEY: undefined }).success).toBe(false);
  });
  it('refuses a live Paystack key in default test mode', () => {
    expect(configSchema.safeParse({ ...process.env, PAYSTACK_MODE: 'test', PAYSTACK_SECRET_KEY: 'sk_live_fixture', CARD_TOKEN_ENCRYPTION_KEY: Buffer.alloc(32).toString('base64') }).success).toBe(false);
  });
  it('defaults to test mode and allows a production-built staging server with test keys', () => {
    const result = configSchema.safeParse({ ...process.env, NODE_ENV: 'production', PALM_PROVIDER: 'tencent', TENCENT_PALM_API_KEY: 'test-only', PAYSTACK_MODE: undefined, PAYSTACK_SECRET_KEY: 'sk_test_fixture', CARD_TOKEN_ENCRYPTION_KEY: Buffer.alloc(32).toString('base64') });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.PAYSTACK_MODE).toBe('test');
  });
  it('requires explicit live mode for live keys and rejects a test key in live mode', () => {
    const env = { ...process.env, PAYSTACK_MODE: 'live', CARD_TOKEN_ENCRYPTION_KEY: Buffer.alloc(32).toString('base64') };
    expect(configSchema.safeParse({ ...env, PAYSTACK_SECRET_KEY: 'sk_live_fixture' }).success).toBe(true);
    expect(configSchema.safeParse({ ...env, PAYSTACK_SECRET_KEY: 'sk_test_fixture' }).success).toBe(false);
  });
  it.each(['0', '-1', '61'])('rejects an unsafe authorization lifetime %s', value => {
    expect(configSchema.safeParse({ ...process.env, AUTH_VALIDITY_SECONDS: value }).success).toBe(false);
  });
});

describe('authentication connection configuration',()=>{
 it.each(['AUTH_DATABASE_URL','AUTH_BASE_URL'])('rejects malformed %s without throwing a credential-bearing URL error',field=>{
  const run=()=>configSchema.safeParse({...process.env,[field]:'credential-marker@invalid-url'});
  expect(run).not.toThrow();
  const result=run();expect(result.success).toBe(false);
  if(!result.success)expect(result.error.issues.map(issue=>issue.message).join(' ')).not.toContain('credential-marker');
 });
});
