/** Direct-to-card rail. A persisted attempt precedes the only charge POST.
 * Unknown outcomes are reconciled with GET; never automatically charge again. */
import { config } from '../config.js';
import { db } from '../db/client.js';
import { AppError, fromPostgresError } from '../errors.js';
import { logger } from '../logger.js';
import { cardSignature, openAuthorization, paystack, paystackDomain, cardLinkEnabled, requirePaystack } from './paystack.js';

export interface CardPaymentAttempt {
 transaction_id:string; user_id:string; card_id:string; reference:string;
 domain:string; subaccount?:string|null; amount_minor:number; currency:string; signature_hash:string;
 authorization_ciphertext:string|null; status:string;
}
function failure(error: {code?:string;message?:string}|null):void {
 if(error)throw fromPostgresError(error)??new AppError(503,'card_payment_unavailable','Card payment status is unavailable. Check this sale before trying again.');
}
function credentials(a:CardPaymentAttempt):{authorization:any;email:string} {
 if(!a.authorization_ciphertext)throw Error('Missing encrypted authorization');
 const value=openAuthorization(a.user_id,a.authorization_ciphertext) as any;
 if(typeof value?.email!=='string'||!value.email||value.authorization?.reusable!==true||typeof value.authorization?.authorization_code!=='string'||!value.authorization.authorization_code||typeof value.authorization.signature!=='string'||cardSignature(value.authorization.signature)!==a.signature_hash)throw Error('Invalid saved authorization');
 return value;
}
function bound(a:CardPaymentAttempt,t:any,email:string):boolean {
 return t?.reference===a.reference && t.domain===a.domain && t.amount===Number(a.amount_minor) && t.currency==='NGN'
  && typeof t.customer?.email==='string' && t.customer.email.toLowerCase()===email.toLowerCase()
  && t.metadata?.purpose==='palm_card_payment' && t.metadata?.transaction_id===a.transaction_id && t.metadata?.user_id===a.user_id
  && (!a.subaccount||t.subaccount?.subaccount_code===a.subaccount)
  && t.channel==='card' && t.authorization?.signature && cardSignature(t.authorization.signature)===a.signature_hash
  && Number.isSafeInteger(t.id) && t.id>0;
}
async function finish(a:CardPaymentAttempt,status:string,id?:string):Promise<void>{
 const r=await db.rpc('finish_card_payment',{p_reference:a.reference,p_status:status,p_provider_id:id??null});failure(r.error);
}
export async function verifyCardPayment(a:CardPaymentAttempt):Promise<void>{
 if(a.domain!==paystackDomain()||['success','failed'].includes(a.status))return;
 const {email}=credentials(a);
 // Only the authenticated provider GET can establish a final outcome.
 const t=await paystack('/transaction/verify/'+encodeURIComponent(a.reference));
 // A declined response may have no card authorization. Still bind its reference,
 // amount, currency, mode and original customer before accepting failure.
 const base=t?.reference===a.reference&&t.domain===a.domain&&t.amount===Number(a.amount_minor)&&t.currency==='NGN'
  &&typeof t.customer?.email==='string'&&t.customer.email.toLowerCase()===email.toLowerCase();
 if(!base){await finish(a,'manual_review');return;}
 if(t.status==='failed'){await finish(a,'failed');return;}
 if(t.status!=='success'){await finish(a,'pending');return;}
 if(!bound(a,t,email)){await finish(a,'manual_review');return;}
 await finish(a,'success',String(t.id));
}
export async function chargeCardPayment(transactionId:string,terminalId:string):Promise<void>{
 requirePaystack();
 const claim=await db.rpc('begin_card_payment',{p_transaction:transactionId,p_terminal:terminalId,p_domain:paystackDomain(),p_validity:config.AUTH_VALIDITY_SECONDS,p_accept_score:config.PALM_ACCEPT_SCORE});
 failure(claim.error);
 const a=claim.data?.[0] as CardPaymentAttempt|undefined;
 if(!a){
  const existing=await db.from('card_payment_attempts').select('*').eq('transaction_id',transactionId).maybeSingle();failure(existing.error);
  if(existing.data)await verifyCardPayment(existing.data as CardPaymentAttempt);
  return;
 }
 // Failure after claim is an unresolved sale, including a crash before HTTP.
 // Never release this claim or blindly replay POST after a network timeout.
 try{
  const {authorization,email}=credentials(a);
  try{
   await paystack('/transaction/charge_authorization',{authorization_code:authorization.authorization_code,email,
    amount:String(a.amount_minor),currency:'NGN',reference:a.reference,queue:false,
    ...(a.subaccount?{subaccount:a.subaccount}:{}),
    metadata:{purpose:'palm_card_payment',transaction_id:a.transaction_id,user_id:a.user_id}});
  }catch{logger.warn({transactionId},'Card charge outcome unresolved; verifying original reference');}
  await verifyCardPayment(a);
 }catch{
  logger.warn({transactionId},'Card payment requires reconciliation');
  throw new AppError(409,'card_payment_pending','The card payment is being checked. Keep this sale open; do not charge again.');
 }
}
export async function wakeCardPayment(reference:string):Promise<void>{
 const r=await db.from('card_payment_attempts').update({next_check_at:new Date().toISOString()}).eq('reference',reference);failure(r.error);
}
let working=false;
export async function reconcileCardPayments():Promise<void>{
 if(working||!cardLinkEnabled())return;working=true;
 try{
  const r=await db.from('card_payment_attempts').select('*').not('status','in','(success,failed)').lte('next_check_at',new Date().toISOString()).order('next_check_at').limit(20);failure(r.error);
  for(const a of r.data??[]){try{await verifyCardPayment(a as CardPaymentAttempt);}catch{
   await db.from('card_payment_attempts').update({next_check_at:new Date(Date.now()+60000).toISOString()}).eq('transaction_id',a.transaction_id);
   logger.warn({transactionId:a.transaction_id},'Card payment remains unresolved');
  }}
 }catch{logger.error('Card payment reconciliation unavailable');}finally{working=false;}
}
export function startCardPaymentReconciliation():()=>void{
 void reconcileCardPayments();const timer=setInterval(()=>void reconcileCardPayments(),30000);timer.unref();return()=>clearInterval(timer);
}
