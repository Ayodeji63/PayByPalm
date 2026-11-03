/** Provider selection is for NEW operations only. Recovery uses the persisted context. */
import { config } from '../config.js';
import { AppError } from '../errors.js';
import * as ps from './paystack.js';
import { flutterwaveGateway, flutterwaveKey } from './flutterwave.js';

export type PaymentProvider='paystack'|'flutterwave';
export type PaymentMode='test'|'live';
export interface PaymentContext {provider:PaymentProvider;mode:PaymentMode}
export function paymentProvider():PaymentProvider {return config.PAYMENT_PROVIDER??'paystack';}
export function paymentMode():PaymentMode {return config.PAYMENT_MODE??ps.paystackDomain();}
export function providerOf(value:unknown):PaymentProvider {
 if(value===undefined)return 'paystack'; // legacy records/tests; migration backfills stored rows
 if(value==='paystack'||value==='flutterwave')return value;
 throw new AppError(503,'invalid_payment_provider','The saved payment provider needs review.');
}
export function paymentContext(provider=paymentProvider(),mode=paymentMode()):PaymentContext {return {provider,mode};}
export function savedPaymentContext(a:{provider?:unknown;domain:unknown}):PaymentContext {
 if(a.domain!=='test'&&a.domain!=='live')throw new AppError(503,'invalid_payment_mode','The saved payment environment needs review.');
 return paymentContext(providerOf(a.provider),a.domain);
}
export function verificationAmount(provider=paymentProvider()):number{return provider==='flutterwave'?10000:5000;}
export function paymentEnabled(c=paymentContext()):boolean {
 if(c.provider==='paystack')return ps.cardLinkEnabled(c.mode);
 return !!flutterwaveKey(c.mode)&&!!config.CARD_TOKEN_ENCRYPTION_KEY;
}
export function requirePayment(purpose:'link'|'payment'='link',c=paymentContext()):void {
 if(c.provider==='paystack'){
  if(c.mode===ps.paystackDomain())ps.requirePaystack(purpose);else ps.requirePaystack(purpose,c.mode);
  return;
 }
 if(!paymentEnabled(c))throw new AppError(503,purpose==='payment'?'card_payment_not_configured':'card_link_not_configured','Flutterwave payment credentials are not configured for this environment.');
 if(purpose==='payment'&&!config.FLUTTERWAVE_NOAUTH_APPROVED)throw new AppError(503,'card_payment_not_configured','Flutterwave saved-card checkout requires account NOAUTH approval.');
}
export function recoveryContexts():PaymentContext[] {
 return (['paystack','flutterwave'] as const).flatMap(provider=>(['test','live'] as const).map(mode=>({provider,mode}))).filter(c=>paymentEnabled(c));
}
export function assertPaymentSelection(expectedMode:string,expectedProvider?:PaymentProvider):void {
 // Old wallet releases remain compatible only with the legacy Paystack selection.
 if(expectedMode!==paymentMode()||(expectedProvider??'paystack')!==paymentProvider())throw new AppError(409,'payment_mode_changed','The payment provider or environment changed. Reload your cards and agree again.');
}
export interface Gateway {
 checkoutUrl(value:unknown):string;
 initialize(body:any):Promise<any>;
 verify(reference:string):Promise<any>;
 charge(body:any):Promise<any>;
 refund(reference:string,id:string,amount:number):Promise<any>;
 refunds(id:string,refundId?:string|null):Promise<any[]>;
}
export function paymentGateway(c=paymentContext()):Gateway {
 if(c.provider==='flutterwave')return flutterwaveGateway(c.mode);
 const call=(path:string,body?:unknown)=>c.mode===ps.paystackDomain()?(body===undefined?ps.paystack(path):ps.paystack(path,body)):ps.paystack(path,body,c.mode);
 return {
  checkoutUrl:value=>ps.checkoutUrl(value),
  initialize:body=>call('/transaction/initialize',body),
  verify:reference=>call('/transaction/verify/'+encodeURIComponent(reference)),
  charge:body=>call('/transaction/charge_authorization',body),
  refund:(reference,_id,amount)=>call('/refund',{transaction:reference,amount,currency:'NGN',customer_note:'PayByPalm card verification refund'}),
  refunds:id=>call('/refund?transaction='+encodeURIComponent(id)+'&perPage=100'),
 };
}
