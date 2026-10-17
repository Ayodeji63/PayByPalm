import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  config: { isProduction: false, AUTH_VALIDITY_SECONDS: 60, PALM_ACCEPT_SCORE: 85, PALM_STEP_UP_SCORE: 70, MAX_CANDIDATES: 4 },
  single: vi.fn(), eq: vi.fn(), update: vi.fn(), rpc: vi.fn(),
  balance: vi.fn(), profile: vi.fn(), wallet: vi.fn(), search: vi.fn(),
}));
vi.mock('../config.js', () => ({ config: mocks.config }));
vi.mock('../db/client.js', () => {
  const query = {
    select: vi.fn().mockReturnThis(), eq: mocks.eq.mockReturnThis(),
    update: mocks.update.mockReturnThis(), maybeSingle: mocks.single,
  };
  return { db: { from: () => query, rpc: mocks.rpc } };
});
vi.mock('../db/queries.js', () => ({
  getBalanceMinor: mocks.balance, getProfile: mocks.profile,
  getWalletAccountId: mocks.wallet, getCandidatesByLast4: vi.fn(),
  maskName: (name: string) => name, maskBalanceMinor: (value: number) => value,
}));
vi.mock('../palm/index.js', () => ({ palm: { search: mocks.search } }));
vi.mock('../lib/image.js', () => ({ normaliseImage: (data: string) => ({ data }) }));
import { authenticateTransaction, confirmTransaction, createTransaction, topUp } from './paymentService.js';

const terminal = { id: 'terminal', merchantId: 'merchant', merchantName: 'Merchant', label: 'Counter' };
const profile = { id: 'payer', full_name: 'Payer', pin_hash: null };
const pending = { id: 'transaction', terminal_id: terminal.id, amount_minor: 100, status: 'pending' };
const authenticated = { ...pending, status: 'authenticated', matched_user_id: profile.id, match_score: 92, authenticated_at: new Date().toISOString() };
const settled = { ...authenticated, status: 'settled', settled_at: new Date().toISOString() };
const log = { info: vi.fn(), warn: vi.fn() } as any;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.config.isProduction = false;
  mocks.single.mockReset(); mocks.rpc.mockReset();
  mocks.balance.mockReset().mockResolvedValue(1000);
  mocks.profile.mockReset().mockResolvedValue(profile);
  mocks.wallet.mockReset().mockResolvedValue('account');
  mocks.search.mockReset().mockResolvedValue({ userId: profile.id, score: 92 });
});

describe('payment integrity', () => {
  it('never credits sandbox funds in production', async () => {
    mocks.config.isProduction = true;
    await expect(topUp(profile.id, 100)).rejects.toMatchObject({ status: 403 });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it('uses the stable sale reference for initiation', async () => {
    mocks.rpc.mockResolvedValue({ data: pending, error: null });
    await createTransaction(terminal, 100, 'Lunch', 'sale-reference');
    expect(mocks.rpc).toHaveBeenCalledWith('create_terminal_transaction', {
      p_terminal_id: terminal.id, p_sale_id: 'sale-reference', p_amount: 100, p_description: 'Lunch',
    });
  });
  it('rejects the losing authentication update instead of returning its payer', async () => {
    mocks.single.mockResolvedValueOnce({ data: pending, error: null }).mockResolvedValueOnce({ data: null, error: null });
    await expect(authenticateTransaction(pending.id, terminal, 'image', undefined, log))
      .rejects.toMatchObject({ code: 'invalid_transaction_state' });
    expect(mocks.eq).toHaveBeenCalledWith('status', 'pending');
  });
  it('does not overwrite another outcome on insufficient funds', async () => {
    mocks.balance.mockResolvedValue(0);
    mocks.single.mockResolvedValueOnce({ data: pending, error: null }).mockResolvedValueOnce({ data: null, error: null });
    await expect(authenticateTransaction(pending.id, terminal, 'image', undefined, log))
      .rejects.toMatchObject({ code: 'invalid_transaction_state' });
    expect(mocks.eq).toHaveBeenCalledWith('status', 'pending');
  });
  it('does not swallow a failed insufficient-funds state update', async () => {
    mocks.balance.mockResolvedValue(0);
    mocks.single.mockResolvedValueOnce({ data: pending, error: null }).mockResolvedValueOnce({ data: null, error: { message: 'failed' } });
    await expect(authenticateTransaction(pending.id, terminal, 'image', undefined, log))
      .rejects.toMatchObject({ code: 'db_error' });
  });
  it('does not authenticate a step-up payer with no PIN', async () => {
    mocks.search.mockResolvedValue({ userId: profile.id, score: 78 });
    mocks.single.mockResolvedValue({ data: pending, error: null });
    expect(await authenticateTransaction(pending.id, terminal, 'image', undefined, log))
      .toMatchObject({ decision: 'reject', reason: 'no_pin_set' });
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it('rejects scores below current policy before any settlement', async () => {
    mocks.single.mockResolvedValue({ data: { ...authenticated, match_score: 60 }, error: null });
    await expect(confirmTransaction(pending.id, terminal, undefined)).rejects.toMatchObject({ code: 'payment_match_rejected' });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it('returns a receipt without reading or exposing the current wallet balance', async () => {
    mocks.single.mockResolvedValue({ data: authenticated, error: null });
    mocks.rpc.mockResolvedValue({ data: settled, error: null });
    mocks.balance.mockRejectedValue(new Error('balance unavailable'));
    const receipt = await confirmTransaction(pending.id, terminal, undefined);
    expect(receipt).toMatchObject({ transactionId: pending.id });
    expect(receipt).not.toHaveProperty('balanceMinor');
    expect(mocks.balance).not.toHaveBeenCalled();
  });
  it('returns an already settled receipt without another settlement call', async () => {
    mocks.single.mockResolvedValue({ data: settled, error: null });
    expect(await confirmTransaction(pending.id, terminal, undefined)).toMatchObject({ transactionId: pending.id });
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.balance).not.toHaveBeenCalled();
  });
  it('shares a payer PIN budget across different terminals and payment IDs', async () => {
    mocks.single.mockResolvedValue({ data: { ...authenticated, match_score: 78 }, error: null });
    mocks.profile.mockResolvedValue({ ...profile, pin_hash: 'test-hash' });
    mocks.rpc.mockResolvedValue({ data: 900, error: null });
    await expect(confirmTransaction(pending.id, terminal, '2468')).rejects.toMatchObject({ status: 429 });
    expect(mocks.rpc).toHaveBeenCalledWith('consume_api_budget', expect.objectContaining({ p_limit: 5, p_window_seconds: 900 }));
    expect(mocks.rpc).not.toHaveBeenCalledWith('post_transaction', expect.anything());
  });
  it('passes freshness policy to the atomic settlement function', async () => {
    mocks.single.mockResolvedValue({ data: authenticated, error: null });
    mocks.rpc.mockResolvedValue({ data: settled, error: null });
    await confirmTransaction(pending.id, terminal, undefined);
    expect(mocks.rpc).toHaveBeenCalledWith('post_transaction', { txn_id: pending.id, p_auth_validity_seconds: 60 });
  });
  it('rejects expired authorization without overwriting financial records', async () => {
    mocks.single.mockResolvedValue({ data: { ...authenticated, authenticated_at: '2000-01-01T00:00:00Z' }, error: null });
    await expect(confirmTransaction(pending.id, terminal, undefined)).rejects.toMatchObject({ code: 'stale_authentication' });
    expect(mocks.update).not.toHaveBeenCalled(); expect(mocks.rpc).not.toHaveBeenCalled();
  });
});
