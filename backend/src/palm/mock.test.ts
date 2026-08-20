/**
 * The mock provider is what makes the whole app demoable without Tencent, so its
 * behaviour is worth pinning down: a mock that quietly matches everything would
 * make the payment flow look like it works when it does not.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { createMockProvider, __resetMockGallery } from './mock.js';
import { runWithMockContext } from './mockContext.js';

const ADA = '11111111-1111-1111-1111-111111111111';
const BOLA = '22222222-2222-2222-2222-222222222222';

/** An "image" that carries an identity, as the curl examples in the README use. */
const imageFor = (userId: string) => Buffer.from(`mock:${userId}`).toString('base64');

const NOT_A_PALM = Buffer.from('just some bytes').toString('base64');

describe('mock palm provider', () => {
  const palm = createMockProvider();

  beforeEach(() => __resetMockGallery());

  describe('register', () => {
    it('returns a stable-looking palm id', async () => {
      const { palmId } = await palm.register(ADA, imageFor(ADA));
      expect(palmId).toMatch(/^mock_palm_/);
    });

    it('attaches a request id for the audit trail', async () => {
      const result = await palm.register(ADA, imageFor(ADA));
      expect(result.meta?.requestId).toBeTruthy();
    });
  });

  describe('compare', () => {
    it('matches an enrolled user against their own palm', async () => {
      await palm.register(ADA, imageFor(ADA));
      const result = await palm.compare(ADA, imageFor(ADA));
      expect(result.isMatch).toBe(true);
      expect(result.score).toBe(92);
    });

    it('does not match one user against another user\'s palm', async () => {
      await palm.register(ADA, imageFor(ADA));
      await palm.register(BOLA, imageFor(BOLA));
      const result = await palm.compare(ADA, imageFor(BOLA));
      expect(result.isMatch).toBe(false);
      expect(result.score).toBeLessThan(70);
    });

    it('does not match a user who never enrolled', async () => {
      const result = await palm.compare(ADA, imageFor(ADA));
      expect(result.isMatch).toBe(false);
    });
  });

  describe('search', () => {
    it('finds an enrolled user', async () => {
      await palm.register(ADA, imageFor(ADA));
      const result = await palm.search(imageFor(ADA));
      expect(result?.userId).toBe(ADA);
      expect(result?.score).toBe(92);
    });

    it('returns null for an unknown palm rather than guessing', async () => {
      await palm.register(ADA, imageFor(ADA));
      expect(await palm.search(imageFor(BOLA))).toBeNull();
    });

    it('returns null when the image carries no identity at all', async () => {
      await palm.register(ADA, imageFor(ADA));
      expect(await palm.search(NOT_A_PALM)).toBeNull();
    });

    it('returns null on an empty gallery', async () => {
      expect(await palm.search(imageFor(ADA))).toBeNull();
    });
  });

  describe('X-Mock-User header context', () => {
    it('takes precedence over the image payload', async () => {
      await palm.register(BOLA, imageFor(BOLA));

      // The image says Ada, the header says Bola. The header wins, which is what
      // lets a real JPEG from a webcam stand in for any user during a demo.
      const result = await runWithMockContext({ mockUserId: BOLA }, () =>
        palm.search(imageFor(ADA)),
      );

      expect(result?.userId).toBe(BOLA);
    });

    it('lets a real (non-text) image resolve to a chosen user', async () => {
      await palm.register(ADA, imageFor(ADA));
      const result = await runWithMockContext({ mockUserId: ADA }, () =>
        palm.search(NOT_A_PALM),
      );
      expect(result?.userId).toBe(ADA);
    });

    it('does not leak between calls outside the context', async () => {
      await palm.register(ADA, imageFor(ADA));
      await runWithMockContext({ mockUserId: ADA }, () => palm.search(NOT_A_PALM));
      // Outside the context the hint is gone, so an anonymous image matches nobody.
      expect(await palm.search(NOT_A_PALM)).toBeNull();
    });
  });
});
