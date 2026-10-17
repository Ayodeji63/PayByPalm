import { beforeEach, expect, it, vi } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
const { getUser } = vi.hoisted(() => ({ getUser: vi.fn() }));
vi.mock('../db/client.js', () => ({ authClient: { auth: { getUser } } }));
import { userAuth } from './userAuth.js';

beforeEach(() => vi.clearAllMocks());
async function authenticate(user: Record<string, unknown>) {
  getUser.mockResolvedValue({ data: { user }, error: null });
  const req = { header: () => 'Bearer real-token', log: { child: () => ({}) } } as unknown as Request;
  const next = vi.fn();
  await userAuth(req, {} as Response, next as NextFunction);
  return { req, next };
}
it('rejects phone-only accounts after switching to email identity', async () => {
  const { req, next } = await authenticate({ id: 'user', phone: '2348010001234', phone_confirmed_at: '2026-01-01' });
  expect(req.user).toBeUndefined();
  expect(next).toHaveBeenCalledWith(expect.objectContaining({ code: 'email_verification_required' }));
});
it('rejects unconfirmed email identities', async () => {
  const { req, next } = await authenticate({ id: 'user', email: 'user@example.com' });
  expect(req.user).toBeUndefined();
  expect(next).toHaveBeenCalledWith(expect.objectContaining({ code: 'email_verification_required' }));
});
it('accepts confirmed real email identities', async () => {
  const { req, next } = await authenticate({ id: 'user', email: 'user@example.com', email_confirmed_at: '2026-10-17T00:00:00Z' });
  expect(req.user?.id).toBe('user');
  expect(next).toHaveBeenCalledWith();
});
it('rejects legacy synthetic email identities even if marked confirmed', async () => {
  const { req, next } = await authenticate({ id: 'legacy', email: '08010001234@phone.paybypalm.local', email_confirmed_at: '2026-01-01' });
  expect(req.user).toBeUndefined();
  expect(next).toHaveBeenCalledWith(expect.objectContaining({ code: 'email_verification_required' }));
});
