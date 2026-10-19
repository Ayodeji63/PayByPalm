import {createCipheriv,createDecipheriv,createHmac,randomBytes} from 'node:crypto';
import {z} from 'zod';
import type {Config} from './config.js';
import {Failure} from './failure.js';

export class ProviderFailure extends Failure {
 constructor(readonly definitive:boolean){super(502,'paystack_unavailable',definitive?'Paystack did not accept this request. Check the account details and try again.':'Paystack could not confirm the result. Check status before trying again.');}
}
export type PaymentMode='test'|'live';
export type PaymentContext={mode:PaymentMode;secret:string|undefined};
export async function backendPaymentMode(config:Config):Promise<PaymentMode>{
 try{
  const response=await fetch(config.PAYMENT_API_BASE_URL+'/payment-settings',{
   headers:{Accept:'application/json'},redirect:'error',cache:'no-store',signal:AbortSignal.timeout(8000),
  });
  if(!response.ok)throw Error();
  const value=z.object({paymentMode:z.enum(['test','live'])}).strict().parse(await response.json());
  return value.paymentMode;
 }catch{throw new Failure(503,'payment_mode_unavailable','The payment backend’s mode could not be checked. Bank payouts are unavailable until it reconnects.');}
}
export async function paymentContext(config:Config):Promise<PaymentContext>{
 const mode=await backendPaymentMode(config);
 const secret=(mode==='live'?config.PAYSTACK_LIVE_SECRET_KEY:config.PAYSTACK_TEST_SECRET_KEY)??
  (config.PAYSTACK_SECRET_KEY?.startsWith(`sk_${mode}_`)?config.PAYSTACK_SECRET_KEY:undefined);
 return {mode,secret};
}
export function paymentSettings(context:PaymentContext){return {mode:context.mode,enabled:!!context.secret};}
export async function assertPaymentMode(config:Config,mode:PaymentMode){
 if(await backendPaymentMode(config)!==mode)throw new Failure(409,'payment_mode_changed','Payment mode changed. Reload payout setup and verify the bank account again.');
}
export function requirePaymentKey(context:PaymentContext){
 if(!context.secret?.startsWith(`sk_${context.mode}_`))throw new Failure(503,'paystack_setup_required',`Configure the ${context.mode} Paystack secret on the admin server to enable bank payouts.`);
}
export function provider(context:PaymentContext){
 return async(path:string,body?:unknown):Promise<any>=>{
  requirePaymentKey(context);
  let response:Response;
  try{response=await fetch('https://api.paystack.co'+path,{
   method:body===undefined?'GET':'POST',headers:{Authorization:`Bearer ${context.secret}`,'Content-Type':'application/json'},
   ...(body===undefined?{}:{body:JSON.stringify(body)}),redirect:'error',signal:AbortSignal.timeout(12000),
  });}catch{throw new ProviderFailure(false);}
  const result=await response.json().catch(()=>null);
  if(!response.ok||result?.status!==true||result.data==null){
   throw new ProviderFailure(response.status>=400&&response.status<500&&result?.status===false);
  }
  return result;
 };
}
export const verifiedAccountSchema=z.object({
 actor:z.string().uuid(),merchant:z.string().uuid(),mode:z.enum(['test','live']),
 bankCode:z.string().regex(/^\d{2,12}$/),bankName:z.string().min(1).max(160),
 accountNumber:z.string().regex(/^\d{10}$/),accountName:z.string().min(1).max(200),expires:z.number().int(),
}).strict();
export type VerifiedAccount=z.infer<typeof verifiedAccountSchema>;
export function sealAccount(config:Config,value:VerifiedAccount){
 const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',Buffer.from(config.SESSION_ENCRYPTION_KEY,'hex'),iv);
 cipher.setAAD(Buffer.from('paybypalm:payout-verification:v1'));
 const ciphertext=Buffer.concat([cipher.update(JSON.stringify(value),'utf8'),cipher.final()]);
 return Buffer.concat([iv,cipher.getAuthTag(),ciphertext]).toString('base64url');
}
export function openAccount(config:Config,token:string,actor:string,merchant:string,mode:PaymentMode):VerifiedAccount{
 try{
  const bytes=Buffer.from(token,'base64url');if(bytes.length<29)throw Error();
  const decipher=createDecipheriv('aes-256-gcm',Buffer.from(config.SESSION_ENCRYPTION_KEY,'hex'),bytes.subarray(0,12));
  decipher.setAAD(Buffer.from('paybypalm:payout-verification:v1'));decipher.setAuthTag(bytes.subarray(12,28));
  const value=verifiedAccountSchema.parse(JSON.parse(Buffer.concat([decipher.update(bytes.subarray(28)),decipher.final()]).toString('utf8')));
  if(value.actor!==actor||value.merchant!==merchant||value.mode!==mode||value.expires<=Date.now()||value.expires>Date.now()+5*60_000)throw Error();
  return value;
 }catch{throw new Failure(409,'account_verification_expired','Verify the bank account again before creating its payout account.');}
}
export function accountFingerprint(config:Config,mode:string,bank:string,account:string,fee:number){
 return createHmac('sha256',Buffer.from(config.SESSION_ENCRYPTION_KEY,'hex')).update(JSON.stringify([mode,bank,account,fee])).digest('hex');
}
