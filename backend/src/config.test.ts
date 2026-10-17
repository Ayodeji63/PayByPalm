import { describe, expect, it } from 'vitest';
import { configSchema } from './config.js';

describe('production payment configuration', () => {
  it('refuses mock authorization in production', () => {
    const result = configSchema.safeParse({ ...process.env, NODE_ENV: 'production', PALM_PROVIDER: 'mock' });
    expect(result.success).toBe(false);
  });
  it('allows a configured real provider in production', () => {
    const result = configSchema.safeParse({ ...process.env, NODE_ENV: 'production', PALM_PROVIDER: 'tencent', TENCENT_PALM_API_KEY: 'test-only' });
    expect(result.success).toBe(true);
  });
  it.each(['0', '-1', '61'])('rejects an unsafe authorization lifetime %s', value => {
    expect(configSchema.safeParse({ ...process.env, AUTH_VALIDITY_SECONDS: value }).success).toBe(false);
  });
});
