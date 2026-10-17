import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Request, Response } from 'express';
import type { SessionView } from '../services/enrolService.js';
const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock('../db/client.js', () => ({ db: { rpc: mocks.rpc } }));
import { enrolStream } from './enrolStream.js';
const lease = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';
const view: SessionView = { sessionId: 'session', status: 'pending', expiresAt: new Date().toISOString() };
function fixture() {
  const response = Object.assign(new EventEmitter(), {
    writeHead: vi.fn(), write: vi.fn().mockReturnValue(true), end: vi.fn(), destroyed: false,
  });
  const request = { log: { warn: vi.fn() } };
  return { res: response, req: request as unknown as Request };
}
beforeEach(() => { vi.useFakeTimers(); mocks.rpc.mockReset().mockResolvedValue({ data: lease, error: null }); });
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); });
describe('bounded enrollment streams', () => {
  it('never overlaps a slow read with another poll', async () => {
    const { req, res } = fixture();
    let resolve!: (value: SessionView) => void;
    const read = vi.fn().mockImplementationOnce(() => new Promise<SessionView>(r => { resolve = r; })).mockResolvedValue(view);
    const started = enrolStream(req, res as unknown as Response, 'terminal', 'session', read);
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(5000);
    expect(read).toHaveBeenCalledTimes(1);
    resolve(view); await started;
    await vi.advanceTimersByTimeAsync(1000);
    expect(read).toHaveBeenCalledTimes(2);
    res.emit('close');
  });
  it('waits for drain before polling a slow reader again', async () => {
    const { req, res } = fixture(); res.write.mockReturnValue(false);
    const read = vi.fn().mockResolvedValue(view);
    await enrolStream(req, res as unknown as Response, 'terminal', 'session', read);
    await vi.advanceTimersByTimeAsync(5000);
    expect(read).toHaveBeenCalledTimes(1);
    res.emit('drain'); await vi.advanceTimersByTimeAsync(1000);
    expect(read).toHaveBeenCalledTimes(2);
    res.emit('close');
  });
  it('aborts reads and releases the lease when the client disconnects', async () => {
    const { req, res } = fixture(); let signal!: AbortSignal;
    const read = vi.fn().mockImplementation((incoming: AbortSignal) => {
      signal = incoming;
      return new Promise((_resolve, reject) => incoming.addEventListener('abort', () => reject(new Error('aborted')), { once: true }));
    });
    const started = enrolStream(req, res as unknown as Response, 'terminal', 'session', read);
    await Promise.resolve(); res.emit('close'); await started;
    expect(signal.aborted).toBe(true);
    expect(mocks.rpc).toHaveBeenCalledWith('release_api_stream', { p_id: lease });
    await vi.advanceTimersByTimeAsync(100000); expect(read).toHaveBeenCalledTimes(1);
  });
  it('enforces a lifetime even if its database read hangs', async () => {
    const { req, res } = fixture();
    const read = vi.fn().mockImplementation((signal: AbortSignal) => new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true })));
    const started = enrolStream(req, res as unknown as Response, 'terminal', 'session', read);
    await vi.advanceTimersByTimeAsync(90000); await started;
    expect(res.end).toHaveBeenCalledTimes(1);
    expect(mocks.rpc).toHaveBeenCalledWith('release_api_stream', { p_id: lease });
  });
  it('rejects an exhausted shared stream quota before sending headers', async () => {
    const { req, res } = fixture(); mocks.rpc.mockResolvedValue({ data: null, error: null });
    await expect(enrolStream(req, res as unknown as Response, 'terminal', 'session', vi.fn())).rejects.toMatchObject({ status: 429 });
    expect(res.writeHead).not.toHaveBeenCalled();
  });
});
