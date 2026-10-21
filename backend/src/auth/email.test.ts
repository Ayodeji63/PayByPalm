import { expect, it, vi } from 'vitest';
import { X509Certificate } from 'node:crypto';
import { supabaseRootCertificate } from './supabase-ca.js';
import { authPool, deliverAuthEmail } from './engine.js';
it.each(['verify','reset'] as const)('sends %s mail through Resend using a server-only key and a fragment token',async purpose=>{
 const transport=vi.fn(async()=>new Response(JSON.stringify({id:'email-id'}),{status:200}));
 await deliverAuthEmail('secret-key','auth@example.com','https://www.paybypalm.app','recipient@example.com',purpose,'single-purpose-token',transport as typeof fetch);
 const [url,options]=transport.mock.calls[0] as unknown as [string,RequestInit];
 expect(url).toBe('https://api.resend.com/emails');expect(options.redirect).toBe('error');
 expect((options.headers as Record<string,string>).Authorization).toBe('Bearer secret-key');
 const body=JSON.parse(options.body as string);expect(body.to).toEqual(['recipient@example.com']);
 expect(body.text).toContain(`https://www.paybypalm.app/auth/${purpose==='verify'?'confirm':'reset'}#token=single-purpose-token`);
 expect(body.text).not.toContain('secret-key');
});
it.each([429,403,500])('does not expose the Resend %s response body',async status=>{
 const transport=vi.fn(async()=>new Response('recipient@example.com secret-token',{status}));
 await expect(deliverAuthEmail('key','auth@example.com','https://wallet.example.com','recipient@example.com','verify','token',transport as typeof fetch))
  .rejects.toMatchObject({status:503,code:status===429?'email_delivery_limited':'email_send_failed'});
});
it('maps network errors to a safe retryable mail failure',async()=>{
 const transport=vi.fn(async()=>{throw new Error('private network diagnostic');});
 await expect(deliverAuthEmail('key','auth@example.com','https://wallet.example.com','recipient@example.com','verify','token',transport as typeof fetch))
  .rejects.toMatchObject({status:503,code:'email_send_failed',message:'Authentication email could not be delivered.'});
});
it('rejects non-PostgreSQL database URLs',()=>{expect(()=>authPool('https://example.com')).toThrow('must be PostgreSQL');});
it('enforces certificate validation for hosted PostgreSQL',async()=>{
 const pool=authPool('postgres://account:password@pooler.example.com/db?sslmode=no-verify&options=evil');
 expect(pool.options.ssl).toEqual({rejectUnauthorized:true});expect(pool.options.options).toBeUndefined();
 expect(pool.options.connectionString).not.toContain('no-verify');await pool.end();
});

it('trusts the public Supabase CA while retaining certificate and hostname verification',async()=>{
 const certificate=new X509Certificate(supabaseRootCertificate);
 expect(certificate.ca).toBe(true);
 expect(certificate.fingerprint256).toBe('80:70:25:AD:50:D4:ED:21:9D:2C:9C:7D:29:9C:00:4F:82:4E:B0:0C:F7:F6:5A:FE:F6:07:D0:7B:72:E6:CA:FA');
 const pool=authPool('postgres://account:password@aws-0-test.pooler.supabase.com/db?sslmode=no-verify');
 const ssl=pool.options.ssl;
 expect(ssl).toMatchObject({rejectUnauthorized:true});
 expect(typeof ssl==='object'&&Array.isArray(ssl.ca)&&ssl.ca.includes(supabaseRootCertificate)).toBe(true);
 expect(typeof ssl==='object'&&ssl.checkServerIdentity).toBeUndefined();
 await pool.end();
});
it('does not add Supabase trust for lookalike hostnames',async()=>{
 const pool=authPool('postgres://account:password@aws-0-test.pooler.supabase.com.attacker.example/db');
 expect(pool.options.ssl).toEqual({rejectUnauthorized:true});await pool.end();
});
