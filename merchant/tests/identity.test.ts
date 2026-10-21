import { expect, it, vi } from 'vitest';
import { centralAuth } from '../server/identity.js';
it('logs in through the central backend and preserves UUID/session fields',async()=>{
 const transport=vi.fn(async()=>new Response(JSON.stringify({user:{id:'original-uuid',email:'user@example.com',email_confirmed_at:'2026-01-01'},session:{accessToken:'opaque',refreshToken:'opaque',expiresAt:123}})));
 const auth=centralAuth('https://api.example.com',transport as typeof fetch).auth;
 const result=await auth.signInWithPassword({email:'user@example.com',password:'password'});
 expect(result.data.user?.id).toBe('original-uuid');expect(result.data.session?.access_token).toBe('opaque');
 const [url,options]=transport.mock.calls[0] as unknown as [string,RequestInit];
 expect(url).toBe('https://api.example.com/auth/login');expect(options.redirect).toBe('error');
 expect(JSON.parse(options.body as string)).toEqual({email:'user@example.com',password:'password'});
});
it('uses an explicit bearer token for identity validation',async()=>{
 const transport=vi.fn(async()=>new Response(JSON.stringify({user:{id:'original-uuid'}})));
 await centralAuth('https://api.example.com',transport as typeof fetch).auth.getUser('opaque');
 const [url,options]=transport.mock.calls[0] as unknown as [string,RequestInit];
 expect(url).toBe('https://api.example.com/auth/session');expect((options.headers as Record<string,string>).Authorization).toBe('Bearer opaque');
});
it.each([401,403,429,503])('preserves central auth status %s without trusting arbitrary diagnostics',async status=>{
 const transport=vi.fn(async()=>new Response(JSON.stringify({error:{code:'fixed_code',message:'secret-provider-diagnostic'}}),{status}));
 const result=await centralAuth('https://api.example.com',transport as typeof fetch).auth.getUser('opaque');
 expect(result.error).toEqual({status,code:'fixed_code'});expect(JSON.stringify(result)).not.toContain('secret-provider-diagnostic');
});
it('does not follow redirects with credentials',async()=>{
 const transport=vi.fn(async()=>{throw new TypeError('redirect refused');});
 const result=await centralAuth('https://api.example.com',transport as typeof fetch).auth.signInWithPassword({email:'user@example.com',password:'password'});
 expect(result.error?.status).toBe(503);
});
it('forwards logout to the central session service',async()=>{
 const transport=vi.fn(async()=>new Response(null,{status:204}));
 expect((await centralAuth('https://api.example.com',transport as typeof fetch).auth.signOut('opaque')).error).toBeNull();
 const [url,options]=transport.mock.calls[0] as unknown as [string,RequestInit];
 expect(url).toBe('https://api.example.com/auth/logout');expect((options.headers as Record<string,string>).Authorization).toBe('Bearer opaque');
});
