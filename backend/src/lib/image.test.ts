import { describe, expect, it } from 'vitest';
import { normaliseImage } from './image.js';
import { AppError } from '../errors.js';

/** n bytes of base64-encoded content. */
const b64OfBytes = (n: number) => Buffer.alloc(n, 0x41).toString('base64');

describe('normaliseImage', () => {
  it('accepts bare base64', () => {
    const result = normaliseImage(b64OfBytes(100));
    expect(result.bytes).toBe(100);
  });

  it('strips a data-url prefix', () => {
    // Browsers produce this shape from canvas.toDataURL(). Rejecting it would be
    // a needless kiosk failure over a string prefix.
    const bare = b64OfBytes(60);
    const result = normaliseImage(`data:image/jpeg;base64,${bare}`);
    expect(result.data).toBe(bare);
    expect(result.data.startsWith('data:')).toBe(false);
  });

  it('strips a png data-url prefix too', () => {
    const bare = b64OfBytes(60);
    expect(normaliseImage(`data:image/png;base64,${bare}`).data).toBe(bare);
  });

  it('computes decoded size without materialising the buffer', () => {
    for (const size of [1, 2, 3, 999, 1024]) {
      expect(normaliseImage(b64OfBytes(size)).bytes).toBe(size);
    }
  });

  it('rejects an empty image', () => {
    expect(() => normaliseImage('')).toThrow(AppError);
    expect(() => normaliseImage('   ')).toThrow(/No palm image/);
  });

  it('rejects non-base64 input', () => {
    expect(() => normaliseImage('not base64!!!')).toThrow(/not valid base64/);
  });

  it('rejects an oversized image', () => {
    // MAX_IMAGE_BYTES is 2MiB in the test env.
    const tooBig = b64OfBytes(2 * 1024 * 1024 + 1);
    expect(() => normaliseImage(tooBig)).toThrow(/limit is/);
  });

  it('accepts an image exactly at the limit', () => {
    const atLimit = b64OfBytes(2 * 1024 * 1024);
    expect(normaliseImage(atLimit).bytes).toBe(2 * 1024 * 1024);
  });

  it('reports a 400, not a 500, for every rejection', () => {
    for (const bad of ['', 'nope!!', b64OfBytes(3 * 1024 * 1024)]) {
      try {
        normaliseImage(bad);
        expect.unreachable('should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(AppError);
        expect((err as AppError).status).toBe(400);
      }
    }
  });
});
