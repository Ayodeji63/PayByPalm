import { createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { config } from '../config.js';
import { AppError } from '../errors.js';

export const CARD_LINK_AMOUNT = 5000;
export function cardLinkEnabled(): boolean { return !!config.PAYSTACK_SECRET_KEY && !!config.CARD_TOKEN_ENCRYPTION_KEY; }
export function paystackDomain(): 'live'|'test' { return config.PAYSTACK_MODE ?? 'test'; }
export function requirePaystack(): void {
 if(config.PAYSTACK_SECRET_KEY && !config.PAYSTACK_SECRET_KEY.startsWith(`sk_${paystackDomain()}_`)) throw new AppError(503,'payment_mode_mismatch','Payment key does not match the configured payment mode.');
 if (!cardLinkEnabled()) throw new AppError(503,'card_link_not_configured','Card linking needs payment service configuration.');
}
export function checkoutUrl(value: unknown): string {
 if(typeof value!=='string') throw new AppError(502,'invalid_checkout','Payment checkout could not be opened.');
 let url: URL; try { url=new URL(value); } catch { throw new AppError(502,'invalid_checkout','Payment checkout could not be opened.'); }
 if(url.origin!=='https://checkout.paystack.com'||url.username||url.password) throw new AppError(502,'invalid_checkout','Payment checkout could not be opened.');
 return url.href;
}
/** No automatic POST retry: a timeout can mean the provider accepted the request. */
export async function paystack(path: string, body?: unknown): Promise<any> {
 requirePaystack();
 try {
  const response=await fetch('https://api.paystack.co'+path,{
   method:body===undefined?'GET':'POST',redirect:'error',signal:AbortSignal.timeout(15000),
   headers:{Authorization:`Bearer ${config.PAYSTACK_SECRET_KEY}`,'Content-Type':'application/json'},
   ...(body===undefined?{}:{body:JSON.stringify(body)}),
  });
  const result=await response.json() as {status?:boolean;data?:unknown};
  if(!response.ok||result.status!==true||!result.data) throw new Error('provider rejected request');
  return result.data;
 } catch { throw new AppError(502,'payment_service_unavailable','The payment service could not confirm this request. Check its status before trying again.'); }
}
function key(): Buffer {
 const value=Buffer.from(config.CARD_TOKEN_ENCRYPTION_KEY??'','base64');
 if(value.length!==32) throw new Error('Card encryption key is not configured');
 return value;
}
export function sealAuthorization(userId: string, authorization: unknown, email: string): string {
 const iv=randomBytes(12), cipher=createCipheriv('aes-256-gcm',key(),iv);
 cipher.setAAD(Buffer.from(userId));
 const encrypted=Buffer.concat([cipher.update(JSON.stringify({authorization,email}),'utf8'),cipher.final()]);
 return [iv,cipher.getAuthTag(),encrypted].map(x=>x.toString('base64')).join('.');
}
export function openAuthorization(userId: string, value: string): unknown {
 const [iv,tag,data]=value.split('.').map(x=>Buffer.from(x,'base64'));
 if(!iv||!tag||!data) throw new Error('Invalid authorization ciphertext');
 const decipher=createDecipheriv('aes-256-gcm',key(),iv);decipher.setAAD(Buffer.from(userId));decipher.setAuthTag(tag);
 return JSON.parse(Buffer.concat([decipher.update(data),decipher.final()]).toString('utf8'));
}
export function cardSignature(value: string): string { return createHmac('sha256',key()).update(value).digest('hex'); }
export function validPaystackSignature(raw: Buffer, signature: string | undefined): boolean {
 if(!config.PAYSTACK_SECRET_KEY||!signature||! /^[a-fA-F0-9]{128}$/.test(signature)) return false;
 const expected=createHmac('sha512',config.PAYSTACK_SECRET_KEY).update(raw).digest();
 return timingSafeEqual(expected,Buffer.from(signature,'hex'));
}
