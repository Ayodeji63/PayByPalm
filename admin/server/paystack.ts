import {createCipheriv,createDecipheriv,createHmac,randomBytes} from 'node:crypto';
import {z} from 'zod';
import type {Config} from './config.js';
import {Failure} from './failure.js';

export class ProviderFailure extends Failure {
 constructor(readonly definitive:boolean){super(502,'paystack_unavailable',definitive?'Paystack did not accept this request. Check the account details and try again.':'Paystack could not confirm the result. Check status before trying again.');}
}
export function paymentSettings(config:Config){return {mode:config.PAYSTACK_MODE,enabled:!!config.PAYSTACK_SECRET_KEY};}
export function provider(config:Config){
 return async(path:string,body?:unknown):Promise<any>=>{
  if(!config.PAYSTACK_SECRET_KEY)throw new Failure(503,'paystack_setup_required','Bank verification needs the Paystack secret configured on the admin server.');
  let response:Response;
  try{response=await fetch('https://api.paystack.co'+path,{
   method:body===undefined?'GET':'POST',headers:{Authorization:`Bearer ${config.PAYSTACK_SECRET_KEY}`,'Content-Type':'application/json'},
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
export function openAccount(config:Config,token:string,actor:string,merchant:string):VerifiedAccount{
 try{
  const bytes=Buffer.from(token,'base64url');if(bytes.length<29)throw Error();
  const decipher=createDecipheriv('aes-256-gcm',Buffer.from(config.SESSION_ENCRYPTION_KEY,'hex'),bytes.subarray(0,12));
  decipher.setAAD(Buffer.from('paybypalm:payout-verification:v1'));decipher.setAuthTag(bytes.subarray(12,28));
  const value=verifiedAccountSchema.parse(JSON.parse(Buffer.concat([decipher.update(bytes.subarray(28)),decipher.final()]).toString('utf8')));
  if(value.actor!==actor||value.merchant!==merchant||value.mode!==config.PAYSTACK_MODE||value.expires<=Date.now()||value.expires>Date.now()+5*60_000)throw Error();
  return value;
 }catch{throw new Failure(409,'account_verification_expired','Verify the bank account again before creating its payout account.');}
}
export function accountFingerprint(config:Config,mode:string,bank:string,account:string,fee:number){
 return createHmac('sha256',Buffer.from(config.SESSION_ENCRYPTION_KEY,'hex')).update(JSON.stringify([mode,bank,account,fee])).digest('hex');
}
