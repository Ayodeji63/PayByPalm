import { randomUUID } from 'node:crypto';
import { db } from '../db/client.js';
import { config } from '../config.js';
import { AppError, notFound } from '../errors.js';
import { logger } from '../logger.js';
import { CARD_LINK_AMOUNT, cardLinkEnabled, paystackDomain, requirePaystack, paystack, checkoutUrl, sealAuthorization, cardSignature } from './paystack.js';

export interface LinkAttempt {
 id:string; user_id:string; request_id:string; reference:string; email:string; domain:string;
 status:string; checkout_url:string|null; init_started_at:string|null; provider_transaction_id:string|null;
 refund_status:string; refund_id:string|null; card_id:string|null; created_at:string;
}
const PUBLIC_CARD_FIELDS='id,bank,brand,last4,exp_month,exp_year,is_default,is_paused,created_at';
function dbFailure(error: unknown): void { if(error) throw new AppError(503,'card_storage_unavailable','Card storage could not be updated. Please check again shortly.'); }
export function publicAttempt(a: LinkAttempt) {
 return {reference:a.reference,status:a.status,refundStatus:a.refund_status,cardId:a.card_id,createdAt:a.created_at};
}
export async function ownedAttempt(userId:string,reference:string):Promise<LinkAttempt> {
 const {data,error}=await db.from('card_link_attempts').select('*').eq('reference',reference).eq('user_id',userId).maybeSingle();
 dbFailure(error);if(!data) throw notFound('Card-link request not found.');return data as LinkAttempt;
}
export async function listCards(userId:string) {
 const cards=await db.from('linked_cards').select(PUBLIC_CARD_FIELDS).eq('user_id',userId).is('removed_at',null).order('created_at',{ascending:false}).limit(50);
 dbFailure(cards.error);
 const attempts=await db.from('card_link_attempts').select('reference,status,refund_status,card_id,created_at').eq('user_id',userId).order('created_at',{ascending:false}).limit(20);
 dbFailure(attempts.error);
 return {enabled:cardLinkEnabled(),amountMinor:CARD_LINK_AMOUNT,currency:'NGN',testMode:paystackDomain()==='test',cards:cards.data??[],attempts:(attempts.data??[]).map(a=>publicAttempt(a as LinkAttempt))};
}
export async function initializeCardLink(userId:string,email:string,requestId:string) {
 requirePaystack();
 let result=await db.from('card_link_attempts').select('*').eq('user_id',userId).eq('request_id',requestId).maybeSingle();
 dbFailure(result.error);
 if(!result.data){
  result=await db.from('card_link_attempts').insert({user_id:userId,email:email.toLowerCase(),request_id:requestId,reference:'pbp_card_'+randomUUID().replaceAll('-',''),domain:paystackDomain()}).select('*').single();
  if(result.error?.code==='23505'){
   const existing=await db.from('card_link_attempts').select('*').eq('user_id',userId).or(`request_id.eq.${requestId},status.in.(initializing,pending)`).order('created_at',{ascending:false}).limit(1).maybeSingle();
   result=existing as typeof result;
  }
  dbFailure(result.error);
 }
 const attempt=result.data as LinkAttempt|null;
 if(!attempt) throw new AppError(409,'card_link_busy','A card-link request is already in progress. Check its status.');
 if(attempt.domain!==paystackDomain()) throw new AppError(409,'card_mode_changed','This request belongs to another payment environment. Please contact support.');
 if(attempt.checkout_url&&attempt.status==='pending') return {...publicAttempt(attempt),checkoutUrl:checkoutUrl(attempt.checkout_url)};
 if(attempt.status!=='initializing') return {...publicAttempt(attempt),checkoutUrl:null};
 const claimed=await db.from('card_link_attempts').update({init_started_at:new Date().toISOString()}).eq('id',attempt.id).is('init_started_at',null).select('id');
 dbFailure(claimed.error);
 if(!claimed.data?.length) throw new AppError(409,'card_link_busy','Checkout is being prepared. Please check again shortly.');
 try {
  const init=await paystack('/transaction/initialize',{email:attempt.email,amount:String(CARD_LINK_AMOUNT),currency:'NGN',reference:attempt.reference,
   channels:['card'],callback_url:new URL('/cards',config.WALLET_BASE_URL).href,
   metadata:{purpose:'card_link',user_id:userId,request_id:attempt.request_id}});
  if(init.reference!==attempt.reference) throw new Error('Unexpected checkout reference');
  const url=checkoutUrl(init.authorization_url);
  const saved=await db.from('card_link_attempts').update({checkout_url:url,status:'pending'}).eq('id',attempt.id).eq('status','initializing');
  dbFailure(saved.error);
  return {...publicAttempt({...attempt,status:'pending'}),checkoutUrl:url};
 }catch{
  // No checkout URL was handed to the user. The durable reference is retained
  // for late payment reconciliation even when initialization outcomes are unclear.
  const saved=await db.from('card_link_attempts').update({status:'init_failed'}).eq('id',attempt.id).eq('status','initializing');
  dbFailure(saved.error);
  throw new AppError(502,'card_checkout_failed','Checkout could not be opened. No new payment was requested in the wallet. Check your recent linking requests before trying again.');
 }
}
/** Verify the transaction binding before any card is accepted or refund requested. */
export function verifiedPayment(a:LinkAttempt,t:any):boolean {
 return t?.status==='success' && t.reference===a.reference && t.domain===a.domain && t.amount===CARD_LINK_AMOUNT && t.currency==='NGN' &&
  typeof t.customer?.email==='string' && t.customer.email.toLowerCase()===a.email.toLowerCase() &&
  t.metadata?.purpose==='card_link' && t.metadata?.user_id===a.user_id && t.metadata?.request_id===a.request_id &&
  (typeof t.id==='number' && Number.isSafeInteger(t.id) && t.id>0);
}
export function verifiedCard(a:LinkAttempt,t:any):Record<string,string>|null {
 const c=t.authorization;
 if(t.channel!=='card'||c?.channel!=='card'||c.reusable!==true||typeof c.authorization_code!=='string'||!/^AUTH_[A-Za-z0-9]+$/.test(c.authorization_code)||
  c.authorization_code.length>256||typeof c.signature!=='string'||c.signature.length<4||c.signature.length>256||
  typeof c.last4!=='string'||!/^\d{4}$/.test(c.last4)||typeof c.exp_month!=='string'||! /^(0[1-9]|1[0-2])$/.test(c.exp_month)||
  typeof c.exp_year!=='string'||!/^\d{4}$/.test(c.exp_year)||typeof c.bank!=='string'||!c.bank.trim()||c.bank.length>120||
  typeof c.card_type!=='string'||!/visa|mastercard|verve/i.test(c.card_type)||c.card_type.length>40) return null;
 const now=new Date();
 if(Number(c.exp_year)<now.getUTCFullYear()||(Number(c.exp_year)===now.getUTCFullYear()&&Number(c.exp_month)<now.getUTCMonth()+1)) return null;
 return {signature_hash:cardSignature(c.signature),authorization_ciphertext:sealAuthorization(a.user_id,c,a.email),
  bank:c.bank.trim(),brand:c.card_type.trim(),last4:c.last4,exp_month:c.exp_month,exp_year:c.exp_year};
}
function refundMatches(a:LinkAttempt,r:any):boolean {
 const transaction=typeof r?.transaction==='object'?r.transaction?.id:r?.transaction;
 return String(transaction)===a.provider_transaction_id && r.amount===CARD_LINK_AMOUNT && r.currency==='NGN' && r.domain===a.domain &&
  (typeof r.id==='number'&&Number.isSafeInteger(r.id)&&r.id>0);
}
async function updateOwned(reference:string,owner:string,patch:Record<string,unknown>) {
 const result=await db.from('card_link_attempts').update(patch).eq('reference',reference).eq('lease_owner',owner).select('id');
 dbFailure(result.error);if(!result.data?.length) throw new AppError(409,'card_link_busy','Verification is already running. Please check again.');
}
async function reconcileRefund(a:LinkAttempt,owner:string) {
 if(a.refund_status==='processed'||!a.provider_transaction_id) return;
 let refund:any;
 if(a.refund_status==='not_requested'){
  // Commit before calling the provider. A crash/timeout must not issue a second
  // refund POST; later runs query the provider using the original transaction ID.
  await updateOwned(a.reference,owner,{refund_status:'submitting'});
  refund=await paystack('/refund',{transaction:a.reference,amount:CARD_LINK_AMOUNT,currency:'NGN',customer_note:'PayByPalm card verification refund'});
 }else{
  const refunds=await paystack('/refund?transaction='+encodeURIComponent(a.provider_transaction_id)+'&perPage=100');
  if(!Array.isArray(refunds)) throw new Error('Unexpected refunds response');
  const matches=refunds.filter(r=>refundMatches(a,r));
  if(matches.length!==1){
   await updateOwned(a.reference,owner,{refund_status:'manual_review'});return;
  }
  refund=matches[0];
 }
 if(!refundMatches(a,refund)) {await updateOwned(a.reference,owner,{refund_status:'manual_review'});return;}
 const status=refund.status==='processed'?'processed':['pending','processing'].includes(refund.status)?'pending':refund.status==='failed'?'failed':'manual_review';
 await updateOwned(a.reference,owner,{refund_id:String(refund.id),refund_status:status});
}
export async function processCardLink(reference:string):Promise<void> {
 requirePaystack();const owner=randomUUID();
 const claimed=await db.rpc('claim_card_link',{p_reference:reference,p_owner:owner});dbFailure(claimed.error);
 let a=claimed.data?.[0] as LinkAttempt|undefined;if(!a) return;
 try {
  if(a.domain!==paystackDomain()) return;
  if(a.status==='initializing' && a.init_started_at && Date.parse(a.init_started_at)<Date.now()-120_000){
   await updateOwned(reference,owner,{status:'init_failed'});a={...a,status:'init_failed'};
  }
  if(['initializing','pending','init_failed','failed'].includes(a.status)){
   const transaction=await paystack('/transaction/verify/'+encodeURIComponent(a.reference));
   if(transaction.status==='failed'){await updateOwned(reference,owner,{status:'failed'});return;}
   if(transaction.status!=='success') return;
   if(!verifiedPayment(a,transaction)){await updateOwned(reference,owner,{status:'invalid',refund_status:'manual_review'});return;}
   // Allow reconciliation of a late successful payment even after init failed.
   const completed=await db.rpc('complete_card_link',{p_reference:reference,p_owner:owner,p_transaction_id:String(transaction.id),p_card:verifiedCard(a,transaction)});
   dbFailure(completed.error);
   const fresh=await db.from('card_link_attempts').select('*').eq('reference',reference).single();dbFailure(fresh.error);a=fresh.data as LinkAttempt;
  }
  if(['verified','unsupported'].includes(a.status)) await reconcileRefund(a,owner);
 } finally {
  // Retry read/verify and refund reconciliation after process failure or restart.
  await updateOwned(reference,owner,{lease_until:null,lease_owner:null,next_check_at:new Date(Date.now()+60_000).toISOString()});
 }
}
export async function wakeCardLink(reference:string):Promise<void> {
 const result=await db.from('card_link_attempts').update({next_check_at:new Date().toISOString()}).eq('reference',reference);
 dbFailure(result.error);
}
let working=false;
export async function reconcileCardLinks():Promise<void> {
 if(working||!cardLinkEnabled())return;working=true;
 try{
  const rows=await db.from('card_link_attempts').select('reference').or('status.in.(initializing,pending,init_failed,failed),and(status.in.(verified,unsupported),refund_status.neq.processed)').lte('next_check_at',new Date().toISOString()).order('next_check_at').limit(20);
  dbFailure(rows.error);
  for(const row of rows.data??[]){try{await processCardLink(row.reference);}catch{logger.warn({component:'card-link'},'Card linking needs reconciliation; no provider payload logged');}}
 }catch{logger.warn({component:'card-link'},'Card-link reconciliation unavailable; check migration and provider configuration');}
 finally{working=false;}
}
export function startCardReconciliation():()=>void {
 if(!cardLinkEnabled())return ()=>{};
 void reconcileCardLinks();const timer=setInterval(()=>void reconcileCardLinks(),30_000);timer.unref();return ()=>clearInterval(timer);
}
export async function editCard(userId:string,id:string,action:string) {
 const result=await db.rpc('edit_linked_card',{p_user:userId,p_id:id,p_action:action});dbFailure(result.error);
 if(!result.data)throw notFound('Card not found.');
}
