/**
 * Per-request context for the mock palm provider.
 *
 * The mock needs to know which user a given "palm image" is supposed to represent.
 * That hint arrives as an `X-Mock-User` request header, but the provider interface
 * takes an image and nothing else — and it should stay that way, because widening
 * it to carry test plumbing would leak the mock's needs into the real Tencent path.
 *
 * AsyncLocalStorage carries the hint from the middleware to the provider without
 * touching the interface, and without a module-level mutable that would bleed
 * between concurrent requests.
 */

import { AsyncLocalStorage } from 'node:async_hooks';

export interface MockContext {
  /** Supabase user id this request's image should be treated as belonging to. */
  mockUserId?: string;
}

const storage = new AsyncLocalStorage<MockContext>();

export function runWithMockContext<T>(ctx: MockContext, fn: () => T): T {
  return storage.run(ctx, fn);
}

export function currentMockContext(): MockContext {
  return storage.getStore() ?? {};
}
