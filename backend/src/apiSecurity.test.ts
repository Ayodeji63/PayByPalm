import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Server } from 'node:http';
import { gzipSync } from 'node:zlib';
import bcrypt from 'bcryptjs';
import { AppError, PalmProviderError } from './errors.js';

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(), rpc: vi.fn(), login: vi.fn(), refresh: vi.fn(), profile: vi.fn(),
  sendLink: vi.fn(), signup: vi.fn(), verifyOtp: vi.fn(), resend: vi.fn(), adminUpdate: vi.fn(), adminSignOut: vi.fn(), adminCreate: vi.fn(), pinUpdate: vi.fn(), pinEq: vi.fn(), pinNull: vi.fn(), pinSelect: vi.fn(),
  confirm: vi.fn(), authenticate: vi.fn(), authenticateSdk: vi.fn(), beginCapture: vi.fn(),
  warn: vi.fn(), error: vi.fn(), info: vi.fn(),
}));
vi.mock('./logger.js', () => {
  const logger = { warn: mocks.warn, error: mocks.error, info: mocks.info, child: () => logger };
  return { logger };
});
vi.mock('./db/client.js', () => ({
  db: { rpc: mocks.rpc, auth: { admin: { updateUserById: mocks.adminUpdate, signOut: mocks.adminSignOut, createUser: mocks.adminCreate } },
    from: () => ({ update: mocks.pinUpdate.mockReturnThis(), eq: mocks.pinEq.mockReturnThis(), is: mocks.pinNull.mockReturnThis(), select: mocks.pinSelect }) },
  authClient: { auth: { getUser: mocks.getUser, signInWithPassword: mocks.login, signInWithOtp: mocks.sendLink, refreshSession: mocks.refresh, signUp: mocks.signup, verifyOtp: mocks.verifyOtp, resend: mocks.resend } },
}));
vi.mock('./middleware/userAuth.js', () => ({
  userAuth: (req: any, _res: any, next: any) => {
    if (!req.header('authorization')) return next(new AppError(401, 'unauthorized', 'Authentication required.'));
    req.user = { id: 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa' }; next();
  },
  requireUser: (req: any) => req.user,
}));
vi.mock('./middleware/terminalAuth.js', () => ({
  terminalAuth: (req: any, _res: any, next: any) => {
    if (!req.header('x-terminal-key')) return next(new AppError(401, 'unauthorized', 'Authentication required.'));
    req.terminal = { id: 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb' }; next();
  },
  requireTerminal: (req: any) => req.terminal,
}));
vi.mock('./db/queries.js', () => ({ getProfile: mocks.profile, getWalletAccountId: vi.fn(), getBalanceMinor: vi.fn() }));
vi.mock('./services/paymentService.js', () => ({
  confirmTransaction: mocks.confirm, authenticateTransaction: mocks.authenticate,
  authenticateSdkTransaction: mocks.authenticateSdk, beginPaymentCapture: mocks.beginCapture,
  createTransaction: vi.fn(), cancelTransaction: vi.fn(), getTerminalTransaction: vi.fn(), topUp: vi.fn(),
}));
vi.mock('./services/enrolService.js', () => ({
  claimSession: vi.fn(), createSession: vi.fn(), getSessionView: vi.fn(), registerPalmForSession: vi.fn(), revokePalm: vi.fn(),
}));
import { createApp } from './index.js';
import { MAX_ENCODED_IMAGE } from './middleware/requestBody.js';

let server: Server;
let base: string;
beforeAll(async () => {
  server = createApp().listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});
afterAll(async () => { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); });
beforeEach(() => {
  vi.clearAllMocks();
  mocks.rpc.mockReset().mockResolvedValue({ data: 0, error: null });
  mocks.login.mockReset().mockResolvedValue({ data: { user: { id: 'user', email: 'user@example.com', email_confirmed_at: '2026-01-01' }, session: { access_token: 'test', refresh_token: 'test', expires_at: 123 } }, error: null });
  mocks.refresh.mockReset().mockResolvedValue({ data: { session: { user: { id: 'user' }, access_token: 'rotated', refresh_token: 'rotated-refresh' } }, error: null });
  mocks.getUser.mockReset().mockResolvedValue({ data: { user: { id: 'user', email: 'user@example.com', email_confirmed_at: '2026-01-01' } }, error: null });
  mocks.profile.mockReset().mockResolvedValue({ id: 'user', pin_hash: bcrypt.hashSync('2468', 4) });
  mocks.confirm.mockReset().mockResolvedValue({ transactionId: 'cccccccc-cccc-4ccc-cccc-cccccccccccc', amountMinor: 100, settledAt: '2026-01-01', maskedName: 'Customer', merchantName: 'Merchant', terminalLabel: 'Counter', balanceMinor: 999999, internalField: 'secret' });
  mocks.authenticate.mockReset();
  mocks.sendLink.mockReset().mockResolvedValue({ data: { user: null, session: null }, error: null });
  mocks.signup.mockReset().mockResolvedValue({ data: { user: { id: 'user', email: 'user@example.com', email_confirmed_at: '2026-01-01' }, session: null }, error: null });
  mocks.verifyOtp.mockReset().mockResolvedValue({ data: { user: { id: 'user', email: 'user@example.com', email_confirmed_at: '2026-01-01' }, session: { access_token: 'verified', refresh_token: 'verified-refresh' } }, error: null });
  mocks.resend.mockReset().mockResolvedValue({ error: null });
  mocks.adminUpdate.mockReset().mockResolvedValue({ error: null });
  mocks.adminSignOut.mockReset().mockResolvedValue({ error: null });
  mocks.pinNull.mockReset().mockReturnThis();
  mocks.pinSelect.mockReset().mockResolvedValue({ data: [{ id: 'user' }], error: null });
});
const post = (path: string, body: unknown, headers: Record<string, string> = {}) => fetch(base + path, {
  method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body),
});

describe('API security boundaries', () => {
  it('publishes only the non-secret runtime payment mode for other apps, without requiring user authentication',async()=>{
    const response=await fetch(base+'/payment-settings');
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).toEqual({paymentMode:'test'});
    expect(mocks.getUser).not.toHaveBeenCalled();
  });
  it('returns an unavailable card balance instead of internal funds',async()=>{
    const r=await fetch(base+'/me',{headers:{Authorization:'Bearer test'}});
    expect(r.status).toBe(200);expect(await r.json()).toMatchObject({balanceMinor:null,cardBalanceAvailable:false,paymentSource:'linked_card'});
  });
  it('retires internal topups without writing a funding transaction',async()=>{
    const r=await post('/topup',{amountMinor:5000},{Authorization:'Bearer test'});
    expect(r.status).toBe(410);
  });

  it('returns controlled JSON for malformed input without logging its raw body', async () => {
    const result = await fetch(base + '/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"password":"secret-marker",' });
    expect(result.status).toBe(400);
    expect(await result.json()).toMatchObject({ error: { code: 'invalid_json' } });
    expect(result.headers.get('x-request-id')).toBeTruthy();
    expect(JSON.stringify(mocks.warn.mock.calls)).not.toContain('secret-marker');
  });
  it('rejects a disallowed Origin before provider/database work', async () => {
    const result = await post('/auth/login', {}, { Origin: 'https://attacker.example' });
    expect(result.status).toBe(403);
    expect(await result.json()).toMatchObject({ error: { code: 'origin_not_allowed' } });
    expect(result.headers.get('access-control-allow-origin')).toBeNull();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it('retains exact allowed-Origin CORS behavior', async () => {
    const result = await post('/auth/login', { email: 'user@example.com', password: 'test' }, { Origin: 'http://localhost:5173' });
    expect(result.status).toBe(200);
    expect(result.headers.get('access-control-allow-origin')).toBe('http://localhost:5173');
    expect(result.headers.get('cache-control')).toBe('no-store');
  });
  it.each(['https://www.paybypalm.app', 'https://paybypalm.app'])('allows signup preflight for configured custom domain %s without Auth or database calls', async origin => {
    const result = await fetch(base + '/auth/signup', {
      method: 'OPTIONS',
      headers: { Origin: origin, 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'content-type' },
    });
    expect(result.status).toBe(204);
    expect(result.headers.get('access-control-allow-origin')).toBe(origin);
    expect(result.headers.get('access-control-allow-credentials')).toBe('true');
    expect(result.headers.get('access-control-allow-methods')).toContain('POST');
    expect(result.headers.get('access-control-allow-headers')?.toLowerCase()).toContain('content-type');
    expect(result.headers.get('vary')).toContain('Origin');
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.signup).not.toHaveBeenCalled();
  });
  it.each(['https://www.paybypalm.app.attacker.example', 'http://www.paybypalm.app', 'https://untrusted.paybypalm.app'])('rejects unlisted or lookalike signup origin %s', async origin => {
    const result = await fetch(base + '/auth/signup', {
      method: 'OPTIONS',
      headers: { Origin: origin, 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'content-type' },
    });
    expect(result.status).toBe(403);
    expect(result.headers.get('access-control-allow-origin')).toBeNull();
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.signup).not.toHaveBeenCalled();
  });
  it('rejects oversized ordinary JSON before invoking Auth', async () => {
    const result = await post('/auth/login', { email: 'user@example.com', password: 'x'.repeat(17000) });
    expect(result.status).toBe(413); expect(mocks.login).not.toHaveBeenCalled();
  });
  it('rejects long credential fields within the body limit', async () => {
    expect((await post('/auth/login', { email: 'user@example.com', password: 'x'.repeat(201) })).status).toBe(400);
    expect((await post('/auth/refresh', { refreshToken: 'x'.repeat(4097) })).status).toBe(400);
    expect(mocks.login).not.toHaveBeenCalled(); expect(mocks.refresh).not.toHaveBeenCalled();
  });
  it('rejects compressed bodies without attempting decompression', async () => {
    const result = await fetch(base + '/auth/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Encoding': 'gzip' },
      body: gzipSync(JSON.stringify({ password: 'secret-marker' })),
    });
    expect(result.status).toBe(415);
  });
  it('authenticates image routes before their larger body parser', async () => {
    const result = await fetch(base + '/transactions/cccccccc-cccc-4ccc-cccc-cccccccccccc/authenticate', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{invalid JSON',
    });
    expect(result.status).toBe(401); expect(mocks.authenticate).not.toHaveBeenCalled();
  });
  it('bounds image fields before invoking the provider', async () => {
    const result = await post('/transactions/cccccccc-cccc-4ccc-cccc-cccccccccccc/authenticate', {
      imageB64: 'A'.repeat(MAX_ENCODED_IMAGE + 1),
    }, { 'X-Terminal-Key': 'test' });
    expect(result.status).toBe(400); expect(mocks.authenticate).not.toHaveBeenCalled();
  });
  it('rejects terminal PIN fields instead of accepting them as palm authorization',async()=>{
    expect((await post('/transactions/cccccccc-cccc-4ccc-cccc-cccccccccccc/confirm',{pin:'2468'},{'X-Terminal-Key':'test'})).status).toBe(400);
    expect(mocks.confirm).not.toHaveBeenCalled();
  });
  it('requires a terminal credential before issuing an SDK user token',async()=>{
    const result=await post('/transactions/cccccccc-cccc-4ccc-cccc-cccccccccccc/palm-capture',{});
    expect(result.status).toBe(401);expect(mocks.beginCapture).not.toHaveBeenCalled();
  });
  it('reports missing card-payment configuration without calling it a linking error',async()=>{
    mocks.confirm.mockRejectedValue(new AppError(503,'card_payment_not_configured','private diagnostic'));
    const response=await post('/transactions/cccccccc-cccc-4ccc-cccc-cccccccccccc/confirm',{}, {'X-Terminal-Key':'test'});
    expect(response.status).toBe(503);
    const result=await response.json() as {error:{code:string;message:string}};expect(result.error.code).toBe('card_payment_not_configured');
    expect(result.error.message).toContain('Card payments');expect(JSON.stringify(result)).not.toContain('private diagnostic');
  });
  it('explains missing live merchant settlement without exposing database diagnostics',async()=>{
    mocks.confirm.mockRejectedValue(new AppError(503,'merchant_settlement_missing','private SQL diagnostic'));
    const response=await post('/transactions/cccccccc-cccc-4ccc-cccc-cccccccccccc/confirm',{}, {'X-Terminal-Key':'test'});
    expect(response.status).toBe(503);
    const result=await response.json() as {error:{code:string;message:string};requestId:string};
    expect(result.error.code).toBe('merchant_settlement_missing');
    expect(result.error.message).toContain('payout setup is incomplete');
    expect(result.requestId).toBeTruthy();expect(JSON.stringify(result)).not.toContain('private SQL');
  });
  it('passes an opaque SDK capture to the server verifier rather than trusting a client match',async()=>{
    mocks.authenticateSdk.mockResolvedValue({decision:'reject',mode:'compare',score:null});
    const result=await post('/transactions/cccccccc-cccc-4ccc-cccc-cccccccccccc/authenticate',{captureId:'dddddddd-dddd-4ddd-dddd-dddddddddddd',payload:'opaque-capture'},{'X-Terminal-Key':'test'});
    expect(result.status).toBe(200);expect(mocks.authenticateSdk).toHaveBeenCalledOnce();expect(mocks.authenticate).not.toHaveBeenCalled();
  });
  it('rejects caller match/target injection alongside an SDK capture',async()=>{
    const result=await post('/transactions/cccccccc-cccc-4ccc-cccc-cccccccccccc/authenticate',{captureId:'dddddddd-dddd-4ddd-dddd-dddddddddddd',payload:'opaque-capture',isMatch:true,userId:'chosen-payer'},{'X-Terminal-Key':'test'});
    expect(result.status).toBe(400);expect(mocks.authenticateSdk).not.toHaveBeenCalled();
  });
  it('only returns transaction-specific receipt fields', async () => {
    const result = await post('/transactions/cccccccc-cccc-4ccc-cccc-cccccccccccc/confirm', {}, { 'X-Terminal-Key': 'test' });
    const body = await result.json();
    expect(result.status).toBe(200); expect(body).not.toHaveProperty('balanceMinor'); expect(body).not.toHaveProperty('internalField');
  });
  it('hides internal error messages and details', async () => {
    mocks.confirm.mockRejectedValue(new AppError(500, 'db_error', 'diagnostic-marker', { private: 'secret' }));
    const result = await post('/transactions/cccccccc-cccc-4ccc-cccc-cccccccccccc/confirm', {}, { 'X-Terminal-Key': 'test' });
    const body = await result.text();
    expect(result.status).toBe(500); expect(body).not.toContain('diagnostic-marker'); expect(body).not.toContain('secret');
  });
  it('explains missing terminal payment setup without exposing database diagnostics', async () => {
    mocks.confirm.mockRejectedValue(new AppError(503, 'payment_setup_required', 'private-schema-diagnostic'));
    const result = await post('/transactions/cccccccc-cccc-4ccc-cccc-cccccccccccc/confirm', {}, { 'X-Terminal-Key': 'test' });
    const body = await result.text();
    expect(result.status).toBe(503); expect(body).toContain('terminal sale recovery database update'); expect(body).not.toContain('private-schema-diagnostic');
  });
  it('reports the observed duplicate palm registration as a conflict, without raw provider text',async()=>{
    mocks.authenticate.mockRejectedValue(new PalmProviderError('private-provider-diagnostic',{providerCode:2080007,requestId:'provider-reference'}));
    const r=await post('/transactions/cccccccc-cccc-4ccc-cccc-cccccccccccc/authenticate',{imageB64:'AAAA'},{'X-Terminal-Key':'test'});
    const body=await r.json() as {error:{code:string;message:string}};expect(r.status).toBe(409);expect(body.error.code).toBe('palm_already_bound');expect(body.error.message).toContain('already registered');expect(JSON.stringify(body)).not.toContain('private-provider-diagnostic');
  });
  it('hides provider diagnostic text', async () => {
    mocks.authenticate.mockRejectedValue(new PalmProviderError('provider-secret-marker'));
    const result = await post('/transactions/cccccccc-cccc-4ccc-cccc-cccccccccccc/authenticate', { imageB64: 'AAAA' }, { 'X-Terminal-Key': 'test' });
    expect(result.status).toBe(502); expect(await result.text()).not.toContain('provider-secret-marker');
  });
  it.each([
    [1001004,422,'palm_liveness_failed'],[1001005,422,'palm_image_quality_failed'],
    [1001008,409,'palm_already_bound'],[1001019,409,'palm_verification_expired'],
    [1001023,502,'palm_provider_database_error'],[1001029,503,'palm_quota_exceeded'],
    [1001030,503,'palm_license_unavailable'],[1001032,503,'palm_application_unavailable'],
    [2080003,422,'palm_liveness_failed'],[2080004,422,'palm_image_quality_failed'],
    [9999999,502,'palm_provider_error'],
  ] as const)('returns safe, traceable diagnostics for provider code %s',async(providerCode,status,code)=>{
    mocks.authenticate.mockRejectedValue(new PalmProviderError('private-provider-diagnostic',{providerCode,requestId:'tencent-reference',httpStatus:400}));
    const r=await post('/transactions/cccccccc-cccc-4ccc-cccc-cccccccccccc/authenticate',{imageB64:'AAAA'},{'X-Terminal-Key':'test'});
    expect(r.status).toBe(status);
    const body=await r.json() as {error:{message:string}};
    expect(body).toMatchObject({error:{code,details:{provider:'tencent',providerCode,providerRequestId:'tencent-reference',providerHttpStatus:400}},requestId:expect.any(String)});
    expect(body.error.message).toContain(`Tencent error ${providerCode}`);
    expect(JSON.stringify(body)).not.toContain('private-provider-diagnostic');
    expect(mocks.confirm).not.toHaveBeenCalled();
  });
  it('reports the observed alignment failure as a recapture error without exposing SDK diagnostics', async () => {
    mocks.authenticate.mockRejectedValue(new PalmProviderError('grpc invoke failed. call palm alignment sdk err: call PalmAlignGap by rect fail, ret=-360', {providerCode:999,requestId:'provider-alignment'}));
    const result = await post('/transactions/cccccccc-cccc-4ccc-cccc-cccccccccccc/authenticate', {imageB64:'AAAA'}, {'X-Terminal-Key':'test'});
    const body = await result.json() as {error:{code:string;message:string};requestId:string};
    expect(result.status).toBe(422); expect(body.error.code).toBe('palm_image_alignment_failed');
    expect(body.error.message).toContain('hold still'); expect(body.requestId).toBeTruthy();
    expect(JSON.stringify(body)).not.toContain('PalmAlignGap'); expect(mocks.confirm).not.toHaveBeenCalled();
  });
  it('does not assume every Tencent 999 error is an alignment failure', async () => {
    mocks.authenticate.mockRejectedValue(new PalmProviderError('unknown-private-diagnostic', {providerCode:999}));
    const result = await post('/transactions/cccccccc-cccc-4ccc-cccc-cccccccccccc/authenticate', {imageB64:'AAAA'}, {'X-Terminal-Key':'test'});
    expect(result.status).toBe(502); const body=await result.text();
    expect(body).not.toContain('unknown-private-diagnostic'); expect(body).not.toContain('palm_image_alignment_failed');
  });
  it('reports the observed detection-stage failure without exposing SDK internals or authorizing payment',async()=>{
    const diagnostic='grpc invoke failed. err: rpc error: code = Code(268566619) desc = call palm decection sdk err: call PalmDet fail, ret=-21';
    mocks.authenticate.mockRejectedValue(new PalmProviderError(diagnostic,{providerCode:999,requestId:'provider-detection',httpStatus:200}));
    const result=await post('/transactions/cccccccc-cccc-4ccc-cccc-cccccccccccc/authenticate',{imageB64:'AAAA'},{'X-Terminal-Key':'test'});
    const body=await result.json() as {error:{code:string;message:string;details:{providerCode:number;providerRequestId:string}}};
    expect(result.status).toBe(502);
    expect(body.error.code).toBe('palm_image_detection_failed');
    expect(body.error.message).toContain('try a new scan');
    expect(body.error.details).toMatchObject({providerCode:999,providerRequestId:'provider-detection'});
    expect(JSON.stringify(body)).not.toMatch(/PalmDet|268566619|ret=-21/);
    expect(mocks.confirm).not.toHaveBeenCalled();
  });
  it('reports the observed Tencent missing-application error without accepting a palm or leaking diagnostics', async () => {
    mocks.authenticate.mockRejectedValue(new PalmProviderError('private-provider-diagnostic', {providerCode:2080023, requestId:'provider-request'}));
    const result = await post('/transactions/cccccccc-cccc-4ccc-cccc-cccccccccccc/authenticate', {imageB64:'AAAA'}, {'X-Terminal-Key':'test'});
    const body = await result.json() as {error:{code:string;message:string};requestId:string};
    expect(result.status).toBe(503);
    expect(body.error.code).toBe('palm_application_unavailable');
    expect(body.error.message).toContain('configured application');
    expect(body.requestId).toBeTruthy();
    expect(JSON.stringify(body)).not.toContain('private-provider-diagnostic');
    expect(mocks.confirm).not.toHaveBeenCalled();
  });
  it('strips unknown login fields instead of assigning client privileges', async () => {
    const result = await post('/auth/login', { email: 'user@example.com', password: 'test', role: 'admin', user_id: 'other' });
    expect(result.status).toBe(200);
    expect(mocks.login).toHaveBeenCalledWith({ email: 'user@example.com', password: 'test' });
  });
  it('fails closed if shared abuse protection is unavailable', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: 'offline' } });
    const result = await post('/auth/login', { email: 'user@example.com', password: 'test' });
    expect(result.status).toBe(503); expect(mocks.login).not.toHaveBeenCalled();
  });
  it('ignores forged forwarding headers when no proxy is trusted', async () => {
    for (const address of ['198.51.100.1', '198.51.100.2']) await post('/auth/login', { email: 'user@example.com', password: 'test' }, { 'X-Forwarded-For': address });
    const keys = mocks.rpc.mock.calls.filter(([, args]) => args.p_limit === 300).map(([, args]) => args.p_key);
    expect(keys).toHaveLength(2); expect(keys[0]).toBe(keys[1]);
  });
  it('creates a normal email/password signup with name and phone but no session before verification', async () => {
    const result = await post('/auth/signup', { fullName: 'Real User', phone: '08010001234', email: 'user@example.com', password: 'strong-password' });
    expect(result.status).toBe(201);
    expect(await result.json()).toEqual({ email: 'user@example.com', verificationRequired: true });
    expect(mocks.signup).toHaveBeenCalledWith({ email: 'user@example.com', password: 'strong-password', options: { emailRedirectTo: 'http://localhost:5173/auth/confirm', data: { full_name: 'Real User', phone: '08010001234' } } });
    expect(mocks.pinUpdate).not.toHaveBeenCalled(); expect(mocks.sendLink).not.toHaveBeenCalled();
  });
  it('retains separate signup budgets for shared IPs and recipient email', async () => {
    await post('/auth/signup', { fullName: 'Real User', phone: '08010001234', email: 'user@example.com', password: 'strong-password' });
    const limits = mocks.rpc.mock.calls.map(([, args]) => [args.p_limit, args.p_window_seconds]);
    expect(limits).toContainEqual([60, 3600]); expect(limits).toContainEqual([5, 3600]);
  });
  it('rejects missing signup fields before consuming signup-specific budgets', async () => {
    expect((await post('/auth/signup', { email: 'user@example.com' })).status).toBe(400);
    expect(mocks.rpc.mock.calls.some(([, args]) => args.p_window_seconds === 3600)).toBe(false);
  });
  it('reports restricted email delivery without exposing provider messages', async () => {
    mocks.signup.mockResolvedValue({ error: { code: 'email_address_not_authorized', name: 'AuthApiError', status: 400, message: 'secret-provider-diagnostic' } });
    const result = await post('/auth/signup', { fullName: 'Real User', phone: '08010001234', email: 'user@example.com', password: 'strong-password' });
    expect(result.status).toBe(503); expect(await result.json()).toMatchObject({ error: { code: 'email_delivery_restricted' } });
    expect(JSON.stringify(mocks.error.mock.calls)).not.toContain('secret-provider-diagnostic');
  });
  it.each([
    ['Error sending confirmation email', 'email_delivery'],
    ['Database error saving new user', 'signup_database'],
    ['Internal Server Error', 'upstream_service'],
  ])('classifies upstream 500 failures without logging their raw messages', async (message, category) => {
    mocks.signup.mockResolvedValue({ error: { name: 'AuthRetryableFetchError', status: 500, message: message + ' private-user@example.com token=secret' } });
    const result = await post('/auth/signup', { fullName: 'Real User', phone: '08010001234', email: 'user@example.com', password: 'strong-password' });
    expect(result.status).toBe(503);
    expect(mocks.error).toHaveBeenCalledWith(expect.objectContaining({ authStatus: 500, authFailureCategory: category }), 'Email signup failed');
    expect(JSON.stringify(mocks.error.mock.calls)).not.toContain('private-user@example.com');
    expect(JSON.stringify(mocks.error.mock.calls)).not.toContain('token=secret');
    expect(await result.text()).not.toContain('token=secret');
  });
  it('rejects auto-confirmed signup sessions', async () => {
    mocks.signup.mockResolvedValue({ data: { user: { id: 'user' }, session: { access_token: 'unverified-token' } }, error: null });
    const result = await post('/auth/signup', { fullName: 'Real User', phone: '08010001234', email: 'user@example.com', password: 'strong-password' });
    expect(result.status).toBe(503); expect(await result.text()).not.toContain('unverified-token');
  });
  it('rejects expired confirmation sessions without changing credentials or PIN', async () => {
    mocks.refresh.mockResolvedValue({ data: { session: null }, error: { code: 'invalid_grant' } });
    const result = await post('/auth/confirm', { refreshToken: 'expired' });
    expect(result.status).toBe(400); expect(mocks.getUser).not.toHaveBeenCalled();
    expect(mocks.adminUpdate).not.toHaveBeenCalled(); expect(mocks.pinUpdate).not.toHaveBeenCalled();
  });
  it('rotates the confirmation session and verifies the authoritative identity', async () => {
    const result = await post('/auth/confirm', { refreshToken: 'link-refresh' });
    expect(result.status).toBe(200);
    expect(mocks.refresh).toHaveBeenCalledWith({ refresh_token: 'link-refresh' });
    expect(mocks.getUser).toHaveBeenCalledWith('rotated');
    expect(await result.json()).toMatchObject({ session: { accessToken: 'rotated' } });
    expect(mocks.adminUpdate).not.toHaveBeenCalled(); expect(mocks.pinUpdate).not.toHaveBeenCalled();
  });
  it.each([
    { id: 'user', email: 'user@example.com' },
    { id: 'other', email: 'user@example.com', email_confirmed_at: '2026-01-01' },
    { id: 'user', email: '2348010001234@phone.paybypalm.local', email_confirmed_at: '2026-01-01' },
  ])('rejects an unconfirmed, mismatched, or synthetic confirmation identity', async user => {
    mocks.getUser.mockResolvedValue({ data: { user }, error: null });
    const result = await post('/auth/confirm', { refreshToken: 'link-refresh' });
    expect(result.status).toBe(400); expect(await result.text()).not.toContain('rotated-refresh');
  });
  it('resends signup links to the server-owned redirect target', async () => {
    expect((await post('/auth/resend-confirmation', { email: 'user@example.com', redirectTo: 'https://attacker.example' })).status).toBe(200);
    expect(mocks.resend).toHaveBeenCalledWith({ type: 'signup', email: 'user@example.com', options: { emailRedirectTo: 'http://localhost:5173/auth/confirm' } });
  });
  it('retires numeric signup code endpoints', async () => {
    expect((await post('/auth/verify-otp', {})).status).toBe(404);
    expect((await post('/auth/send-otp', {})).status).toBe(404);
  });
  it('normalizes email/password login and never invokes passwordless delivery', async () => {
    const result = await post('/auth/login', { email: ' USER@Example.COM ', password: 'test' });
    expect(result.status).toBe(200); expect(mocks.login).toHaveBeenCalledWith({ email: 'user@example.com', password: 'test' });
    expect(mocks.sendLink).not.toHaveBeenCalled();
  });
  it('rejects unconfirmed login identities', async () => {
    mocks.login.mockResolvedValue({ data: { user: { id: 'user', email: 'user@example.com' }, session: { access_token: 'unconfirmed' } }, error: null });
    const result = await post('/auth/login', { email: 'user@example.com', password: 'test' });
    expect(result.status).toBe(403); expect(await result.text()).not.toContain('unconfirmed');
  });
  it('retires the passwordless link exchange endpoint', async () => {
    expect((await post('/auth/verify-link', { tokenHash: 'a'.repeat(64) })).status).toBe(404);
  });
  it('initializes a PIN only while the stored PIN is still empty', async () => {
    mocks.profile.mockResolvedValue({ id: 'user', pin_hash: null });
    const result = await post('/me/pin', { newPin: '2468' }, { Authorization: 'Bearer test' });
    expect(result.status).toBe(200);
    expect(mocks.pinNull).toHaveBeenCalledWith('pin_hash', null);
    expect(mocks.pinSelect).toHaveBeenCalledWith('id');
  });
  it('rejects a competing PIN setup rather than overwriting the first PIN', async () => {
    mocks.profile.mockResolvedValue({ id: 'user', pin_hash: null });
    mocks.pinSelect.mockResolvedValue({ data: [], error: null });
    const result = await post('/me/pin', { newPin: '2468' }, { Authorization: 'Bearer test' });
    expect(result.status).toBe(409);
    expect(await result.json()).toMatchObject({ error: { code: 'pin_changed' } });
  });
  it('cannot reset an existing PIN during onboarding without the old PIN', async () => {
    const result = await post('/me/pin', { newPin: '2468' }, { Authorization: 'Bearer test' });
    expect(result.status).toBe(401);
    expect(mocks.pinUpdate).not.toHaveBeenCalled();
  });
  it('limits PIN attempts before further profile reads or comparisons', async () => {
    let attempts = 0;
    mocks.rpc.mockImplementation(async (_name, args) => ({ data: args.p_limit === 5 && args.p_window_seconds === 900 && ++attempts > 5 ? 900 : 0, error: null }));
    for (let n = 0; n < 5; n++) {
      expect((await post('/me/pin', { currentPin: '1111', newPin: '1379' }, { Authorization: 'Bearer test' })).status).toBe(401);
    }
    const result = await post('/me/pin', { currentPin: '2468', newPin: '1379' }, { Authorization: 'Bearer test' });
    expect(result.status).toBe(429); expect(result.headers.get('retry-after')).toBe('900');
    expect(mocks.profile).toHaveBeenCalledTimes(5);
  });
});
