/**
 * Token-bucket rate limiter.
 *
 * Used to stay under the palm provider's documented 20 requests/second. Callers
 * await a token rather than being rejected, because the alternative — failing a
 * payment because two students reached terminals in the same second — is a worse
 * outcome than a few tens of milliseconds of delay.
 *
 * SCOPE LIMIT, stated plainly: this bucket is per process. It is correct only
 * while the API runs as a single instance. Scaling horizontally would need a
 * shared limiter (Redis, or the provider's own backpressure). For the hackathon
 * the service stays at one instance.
 */

export interface RateLimiter {
  acquire(): Promise<void>;
}

export function createTokenBucket(ratePerSecond: number, burst = ratePerSecond): RateLimiter {
  let tokens = burst;
  let lastRefill = Date.now();

  const refill = () => {
    const now = Date.now();
    const elapsedSeconds = (now - lastRefill) / 1000;
    if (elapsedSeconds <= 0) return;
    tokens = Math.min(burst, tokens + elapsedSeconds * ratePerSecond);
    lastRefill = now;
  };

  return {
    async acquire(): Promise<void> {
      // Loop rather than recurse: a long queue must not grow the call stack.
      for (;;) {
        refill();
        if (tokens >= 1) {
          tokens -= 1;
          return;
        }
        // Wait exactly as long as the next whole token needs, plus a small margin
        // so we do not wake a hair early and spin.
        const waitMs = Math.ceil(((1 - tokens) / ratePerSecond) * 1000) + 1;
        await new Promise((resolve) => setTimeout(resolve, waitMs));
      }
    },
  };
}
