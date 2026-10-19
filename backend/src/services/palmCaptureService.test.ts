import {beforeEach, describe, expect, it, vi} from 'vitest';
import {createHash} from 'node:crypto';
const m = vi.hoisted(() => ({rpc: vi.fn(), token: vi.fn(), insert: vi.fn(), single: vi.fn(), pages: vi.fn(), gt: vi.fn(), eq: vi.fn(), is: vi.fn()}));
vi.mock('../db/client.js', () => ({db: {rpc: m.rpc, from: () => {
  const chain: any = {select: () => chain, order: () => chain, limit: () => chain, gt: m.gt.mockImplementation(() => chain), eq: m.eq.mockImplementation(() => chain), is: m.is.mockImplementation(() => chain),
    insert: m.insert.mockImplementation(() => chain), single: m.single, then: (resolve: any, reject: any) => m.pages().then(resolve, reject)};
  return chain;
}}}));
vi.mock('../palm/index.js', () => ({palm: {createSdkToken: m.token}}));
vi.mock('../config.js', () => ({config: {PALM_PROVIDER: 'tencent', MAX_IMAGE_BYTES: 2097152}}));
import {consumePalmCapture, getActivePalmCandidates, issuePalmCapture} from './palmCaptureService.js';
const image = {Data: 'ciphertext', DataDigest: 'a'.repeat(32), ImageType: 'RGB'};
const payload = JSON.stringify({RgbImage: image, LivenessRgbImage: image, UserToken: 'sut_transient', SdkVersion: '1.3.0', SdkTimestamps: '{}', VideoPath: 'NO_VIDEO_UPLOAD'});
beforeEach(() => {
  vi.clearAllMocks();
  m.single.mockResolvedValue({data: {id: 'capture'}});
  m.rpc.mockResolvedValue({data: 'user'});
  m.token.mockResolvedValue({token: 'sut_transient', expiresAt: Math.floor(Date.now() / 1000) + 180});
});
describe('capture grants', () => {
  it('stores only a token hash and binds the token to an operation and terminal', async () => {
    const grant = await issuePalmCapture('terminal', 'sale', 'payment', 'user');
    expect(grant.token).toBe('sut_transient');
    expect(m.token).toHaveBeenCalledWith(expect.stringMatching(/^capture_[a-f0-9]{32}$/));
    expect(m.token).not.toHaveBeenCalledWith('user');
    expect(m.insert).toHaveBeenCalledWith(expect.objectContaining({terminal_id: 'terminal', scope_id: 'sale', purpose: 'payment', user_id: 'user', token_hash: createHash('sha256').update('sut_transient').digest('hex')}));
    expect(JSON.stringify(m.insert.mock.calls)).not.toContain('sut_transient');
  });
  it('does not return a credential when the grant cannot be saved', async () => {
    m.single.mockResolvedValueOnce({error: {code: '42P01'}});
    await expect(issuePalmCapture('terminal', 'sale', 'payment', 'user')).rejects.toMatchObject({code: 'palm_sdk_setup_required'});
  });
  it('consumes a grant with server-derived scope and image replay fingerprint', async () => {
    expect(await consumePalmCapture('terminal', 'sale', 'payment', {captureId: 'capture', payload})).toMatchObject({userId: 'user'});
    expect(m.rpc).toHaveBeenCalledWith('consume_palm_capture', expect.objectContaining({p_capture: 'capture', p_terminal: 'terminal', p_scope: 'sale', p_purpose: 'payment'}));
    expect(JSON.stringify(m.rpc.mock.calls)).not.toContain('ciphertext');
    expect(JSON.stringify(m.rpc.mock.calls)).not.toContain('sut_transient');
  });
  it.each(['PC001', '23505'])('rejects expired, wrong-scope or replayed captures (%s)', async code => {
    m.rpc.mockResolvedValueOnce({error: {code}});
    await expect(consumePalmCapture('terminal', 'sale', 'payment', {captureId: 'capture', payload})).rejects.toMatchObject({code: 'palm_capture_expired'});
  });
  it('does not call the grant RPC for an injected provider target', async () => {
    await expect(consumePalmCapture('terminal', 'sale', 'payment', {captureId: 'capture', payload: JSON.stringify({...JSON.parse(payload), CompareUserId: 'other'})})).rejects.toMatchObject({code: 'invalid_sdk_capture'});
    expect(m.rpc).not.toHaveBeenCalled();
  });
});
describe('whole active palm pool', () => {
  it('paginates beyond the first page and excludes revoked/un-enrolled bindings', async () => {
    const first = Array.from({length: 500}, (_, n) => ({id: `binding-${n}`, user_id: `user-${n}`, tencent_palm_id: `palm-${n}`}));
    m.pages.mockResolvedValueOnce({data: first}).mockResolvedValueOnce({data: [{id: 'last', user_id: 'user-last', tencent_palm_id: 'palm-last'}]});
    expect(await getActivePalmCandidates()).toHaveLength(501);
    expect(m.gt).toHaveBeenCalledWith('id', 'binding-499');
    expect(m.is).toHaveBeenCalledWith('revoked_at', null);
    expect(m.eq).toHaveBeenCalledWith('profiles.palm_enrolled', true);
  });
  it('never returns a partial pool when a later page fails', async () => {
    m.pages.mockResolvedValueOnce({data: Array.from({length: 500}, (_, n) => ({id: String(n)}))}).mockResolvedValueOnce({error: {code: 'offline'}});
    await expect(getActivePalmCandidates()).rejects.toMatchObject({code: 'palm_candidates_unavailable'});
  });
});
