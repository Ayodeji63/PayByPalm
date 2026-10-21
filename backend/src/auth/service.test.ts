import { beforeEach, expect, it, vi } from 'vitest';
const mocks=vi.hoisted(()=>({api:{signUpEmail:vi.fn(),sendVerificationEmail:vi.fn(),signInEmail:vi.fn(),getSession:vi.fn(),verifyEmail:vi.fn(),signOut:vi.fn(),requestPasswordReset:vi.fn(),resetPassword:vi.fn()},query:vi.fn()}));
vi.mock('../config.js',()=>({config:{AUTH_DATABASE_URL:'postgres://inert:inert@localhost/test',AUTH_SECRET:'inert-secret',AUTH_BASE_URL:'https://api.example.test',WALLET_BASE_URL:'https://wallet.example.test',RESEND_API_KEY:'inert-resend',RESEND_FROM_EMAIL:'auth@example.test'}}));
vi.mock('./engine.js',()=>({createIdentity:()=>({engine:{api:mocks.api},pool:{query:mocks.query}}),deliverAuthEmail:vi.fn(),withDeliveryStatus:(run:()=>Promise<unknown>)=>run()}));
import { identityService } from './service.js';
const user={id:'11111111-1111-4111-8111-111111111111',email:'customer@example.com',emailVerified:true,updatedAt:new Date('2026-01-01')};
const session={token:'opaque-session',expiresAt:new Date(Date.now()+3600000)};
beforeEach(()=>{
 vi.resetAllMocks();mocks.api.getSession.mockResolvedValue({user,session});mocks.query.mockResolvedValue({rows:[{disabled:false}]});
 mocks.api.signInEmail.mockResolvedValue({user,token:session.token});
});
it('migrated verified identities keep exactly their UUID',async()=>{
 const result=await identityService.login(user.email,'password');
 expect(result.user.id).toBe(user.id);expect(result.session.accessToken).toBe(session.token);
 expect(result.session.refreshToken).toBe(session.token);
});
it.each(['','a.b.c','x'.repeat(4097)])('rejects legacy or invalid session shape before contacting PostgreSQL',async token=>{
 expect(await identityService.session(token)).toBeNull();expect(mocks.api.getSession).not.toHaveBeenCalled();
});
it.each([null,{...user,emailVerified:false},{...user,email:''},{...user,email:'2348012345678@phone.paybypalm.local'}])('does not turn an unverified or missing identity into a session',async candidate=>{
 mocks.api.getSession.mockResolvedValue(candidate?{user:candidate,session}:null);
 expect(await identityService.session('opaque-session')).toBeNull();
});
it('checks disabled state even for an existing session',async()=>{
 mocks.query.mockResolvedValue({rows:[{disabled:true}]});expect(await identityService.session('opaque-session')).toBeNull();
});
it('fails closed on database outages without leaking the driver error',async()=>{
 mocks.query.mockRejectedValue(new Error('password=secret-marker'));
 await expect(identityService.session('opaque-session')).rejects.toMatchObject({status:503,code:'auth_unavailable'});
});
it.each(['INVALID_EMAIL_OR_PASSWORD','INVALID_PASSWORD'])('maps wrong credentials to 401',async code=>{
 mocks.api.signInEmail.mockRejectedValue({body:{code,message:'private-diagnostic'}});
 await expect(identityService.login(user.email,'wrong')).rejects.toMatchObject({status:401,code:'unauthorized'});
});
it('retains the verification-required signal for unverified password login',async()=>{
 mocks.api.signInEmail.mockRejectedValue({body:{code:'EMAIL_NOT_VERIFIED'}});
 await expect(identityService.login(user.email,'password')).rejects.toMatchObject({status:403,code:'email_verification_required'});
});
it('sends verification only after account creation commits',async()=>{
 await identityService.signup({fullName:'Real Customer',email:user.email,phone:'08010001234',password:'password'});
 expect(mocks.api.signUpEmail.mock.invocationCallOrder[0]).toBeLessThan(mocks.api.sendVerificationEmail.mock.invocationCallOrder[0]!);
 expect(mocks.api.sendVerificationEmail).toHaveBeenCalledWith({body:{email:user.email}});
});
it.each(['INVALID_TOKEN','TOKEN_EXPIRED','INVALID_VERIFICATION_TOKEN','VERIFICATION_TOKEN_EXPIRED'])('reports invalid verification links as 400',async code=>{
 mocks.api.verifyEmail.mockRejectedValue({body:{code}});
 await expect(identityService.confirm('token')).rejects.toMatchObject({status:400,code:'invalid_confirmation'});
});
it('never uses client-supplied identity fields during password recovery',async()=>{
 await identityService.reset('recovery-token','new-password');
 expect(mocks.api.resetPassword).toHaveBeenCalledWith({body:{token:'recovery-token',newPassword:'new-password'}});
});
it('revokes only the supplied bearer session',async()=>{
 mocks.api.getSession.mockResolvedValue(null);
 await identityService.logout('opaque-session');
 expect(mocks.api.signOut.mock.calls[0]?.[0].headers.get('authorization')).toBe('Bearer opaque-session');
});

it('does not report logout success if the engine could not delete the session',async()=>{
 await expect(identityService.logout('opaque-session')).rejects.toMatchObject({status:503,code:'auth_unavailable'});
});
