/** Flutterwave v3 only. Tokens remain on the backend; no implicit POST retries. */
import { timingSafeEqual } from 'node:crypto';
import { config } from '../config.js';
import { AppError } from '../errors.js';
import type { Gateway, PaymentMode } from './paymentGateway.js';

export function flutterwaveKey(mode:PaymentMode):string|undefined {
 const explicit=mode==='test'?config.FLUTTERWAVE_TEST_SECRET_KEY:config.FLUTTERWAVE_LIVE_SECRET_KEY;
 const key=explicit??config.FLUTTERWAVE_SECRET_KEY;
 return key?.startsWith(mode==='test'?'FLWSECK_TEST-':'FLWSECK-')?key:undefined;
}
export function toMinor(value:unknown):number {
 // Parse decimal major units without rounding away fractional kobo or accepting exponents.
 const text=typeof value==='number'&&Number.isFinite(value)?String(value):value;
 if(typeof text!=='string'||!/^\d+(?:\.\d{1,2})?$/.test(text))throw new Error('Invalid provider amount');
 const [whole,decimal='']=text.split('.');const minor=Number(whole)*100+Number(decimal.padEnd(2,'0'));
 if(!Number.isSafeInteger(minor)||minor<0||minor>100000000)throw new Error('Invalid provider amount');
 return minor;
}
export function toMajor(value:unknown):string {
 if(typeof value!=='number'||!Number.isSafeInteger(value)||value<=0||value>100000000)throw new Error('Invalid charge amount');
 return `${Math.floor(value/100)}.${String(value%100).padStart(2,'0')}`;
}
export async function flutterwaveRequest(mode:PaymentMode,path:string,body?:unknown):Promise<any> {
 const secret=flutterwaveKey(mode);
 if(!secret)throw new AppError(503,'card_payment_not_configured','Flutterwave credentials are not configured for this environment.');
 if(!path.startsWith('/')||path.startsWith('//')||path.includes('://'))throw new Error('Invalid provider path');
 try {
  const response=await fetch('https://api.flutterwave.com/v3'+path,{method:body===undefined?'GET':'POST',redirect:'error',signal:AbortSignal.timeout(15000),
   headers:{Authorization:`Bearer ${secret}`,'Content-Type':'application/json',Accept:'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});
  const reader=response.body?.getReader();if(!reader)throw Error('Missing response');
  const chunks:Uint8Array[]=[];let size=0;
  for(;;){const r=await reader.read();if(r.done)break;size+=r.value.byteLength;if(size>1024*1024){await reader.cancel();throw Error('Oversized response');}chunks.push(r.value);}
  const result=JSON.parse(Buffer.concat(chunks).toString('utf8'));
  if(!response.ok||result?.status!=='success'||result.data==null)throw Error('Provider request unconfirmed');
  return result.data;
 }catch{throw new AppError(502,'payment_service_unavailable','Flutterwave could not confirm this request. Check its status before trying again.');}
}
export function flutterwaveCheckoutUrl(value:unknown):string {
 if(typeof value!=='string')throw Error('Missing checkout');const u=new URL(value);
 if(u.origin!=='https://checkout.flutterwave.com'||u.username||u.password)throw Error('Invalid Flutterwave checkout');
 return u.href;
}
export function normalizeFlutterwave(t:any,mode:PaymentMode):any {
 if(!t||typeof t!=='object'||!Number.isSafeInteger(t.id)||t.id<=0||typeof t.tx_ref!=='string')throw Error('Invalid transaction');
 const card=t.card,expiry=typeof card?.expiry==='string'?/^(0?[1-9]|1[0-2])\/(\d{2}|\d{4})$/.exec(card.expiry):null;
 const month=expiry?.[1]?.padStart(2,'0'),year=expiry?.[2]?(expiry[2].length===2?'20'+expiry[2]:expiry[2]):undefined;
 const created=Date.parse(t.created_at);const expires=Number.isFinite(created)?new Date(created+365*86400000).toISOString():undefined;
 const token=typeof card?.token==='string'&&/^flw-[A-Za-z0-9_-]{8,500}$/.test(card.token)?card.token:undefined;
 const meta=typeof t.meta==='string'?JSON.parse(t.meta):t.meta;
 if(meta!=null&&(typeof meta!=='object'||Array.isArray(meta)))throw Error('Invalid transaction metadata');
 return {id:t.id,reference:t.tx_ref,domain:mode,amount:toMinor(t.amount),currency:t.currency,
  status:t.status==='successful'?'success':t.status==='failed'?'failed':'ongoing',channel:t.payment_type,customer:t.customer,metadata:meta,
  payment_provider:'flutterwave',provider_created_at:t.created_at,
  authorization:card?{channel:'card',provider:'flutterwave',domain:mode,authorization_code:token,signature:token,reusable:!!token,
   last4:card.last_4digits,exp_month:month,exp_year:year,bank:card.issuer,card_type:card.type,token_expires_at:expires}:null,
  subaccount:typeof meta?.settlement_subaccount==='string'?{subaccount_code:meta.settlement_subaccount}:null};
}
export function normalizeFlutterwaveRefund(r:any,mode:PaymentMode):any {
 const transaction=r?.tx_id??r?.TransactionId;
 const status=['completed-bank-transfer','completed-momo','completed-mpgs','completed-offline','completed-preauth'].includes(r?.status)?'processed':
  r?.status==='completed'||r?.status==='processing'||r?.status?.startsWith('pending')?'pending':r?.status==='failed'?'failed':'manual_review';
 if(!Number.isSafeInteger(r?.id)||r.id<=0||!Number.isSafeInteger(transaction)||transaction<=0)throw Error('Invalid refund');
 return {id:r.id,transaction,amount:toMinor(r.amount_refunded??r.AmountRefunded),currency:'NGN',domain:mode,status};
}
export function validFlutterwaveWebhook(signature:string|undefined):boolean {
 const secret=config.FLUTTERWAVE_WEBHOOK_HASH;
 if(!secret||!signature||Buffer.byteLength(signature)!==Buffer.byteLength(secret))return false;
 return timingSafeEqual(Buffer.from(secret),Buffer.from(signature));
}
export function flutterwaveGateway(mode:PaymentMode):Gateway {
 const call=(path:string,body?:unknown)=>flutterwaveRequest(mode,path,body);
 return {
  checkoutUrl:flutterwaveCheckoutUrl,
  async initialize(body){
   const r=await call('/payments',{tx_ref:body.reference,amount:toMajor(Number(body.amount)),currency:'NGN',payment_options:'card',
    redirect_url:new URL('/cards?provider=flutterwave',config.WALLET_BASE_URL).href,
    customer:{email:body.email},meta:body.metadata,customizations:{title:'PayByPalm card verification'},configurations:{max_retry_attempt:1,session_duration:10}});
   return {reference:body.reference,authorization_url:flutterwaveCheckoutUrl(r.link)};
  },
  async verify(reference){return normalizeFlutterwave(await call('/transactions/verify_by_reference?'+new URLSearchParams({tx_ref:reference})),mode);},
  async charge(body){
   if(!config.FLUTTERWAVE_NOAUTH_APPROVED)throw new AppError(503,'card_payment_not_configured','Flutterwave NOAUTH approval is required for terminal payments.');
   // A redirect/pending response is never a receipt. The caller verifies the original reference.
   return call('/tokenized-charges',{token:body.authorization_code,email:body.email,currency:'NGN',country:'NG',amount:toMajor(Number(body.amount)),
    tx_ref:body.reference,narration:'PayByPalm palm payment',redirect_url:new URL('/cards',config.WALLET_BASE_URL).href,
    meta:body.metadata,...(body.subaccount?{subaccounts:[{id:body.subaccount}]}:{})});
  },
  async refund(_reference,id,amount){
   if(!/^\d+$/.test(id))throw Error('Invalid transaction ID');
   return normalizeFlutterwaveRefund(await call('/transactions/'+id+'/refund',{amount:toMajor(amount),comments:'PayByPalm card verification refund'}),mode);
  },
  async refunds(id,refundId){
   if(refundId){if(!/^\d+$/.test(refundId))throw Error('Invalid refund ID');return [normalizeFlutterwaveRefund(await call('/refunds/'+refundId),mode)];}
   if(!/^\d+$/.test(id))throw Error('Invalid transaction ID');
   // v3 documents an original transaction ID filter. Independently bind each
   // returned refund; an uncertain or missing result never authorizes another POST.
   const r=await call('/refunds?'+new URLSearchParams({id}));
   if(!Array.isArray(r))throw Error('Invalid refund list');
   return r.filter(v=>String(v.tx_id??v.TransactionId)===id).map(v=>normalizeFlutterwaveRefund(v,mode));
  },
 };
}
