/** Flutterwave v3 collection subaccounts: bank settlement, not a stored-value wallet. */
import {randomUUID} from 'node:crypto';
import type {SupabaseClient} from '@supabase/supabase-js';
import {z} from 'zod';
import type {Config} from './config.js';
import {Failure} from './failure.js';
import {accountFingerprint,backendPaymentSelection,openAccount,paymentSettings,sealAccount,type PaymentContext,type PaymentMode} from './paystack.js';

export type FlutterwaveSetup={merchant_id:string;domain:PaymentMode;request_id:string;fingerprint:string;bank_code:string;bank_name:string;account_last4:string;account_name:string;percentage_charge:number;status:string;subaccount_code:string|null;provider_id:number|null};
const fields='merchant_id,domain,request_id,fingerprint,bank_code,bank_name,account_last4,account_name,percentage_charge,status,subaccount_code,provider_id';
export const safeFlutterwaveSetup=(s:FlutterwaveSetup|null)=>s?{provider:'flutterwave',status:s.status,mode:s.domain,bankName:s.bank_name,accountLast4:s.account_last4,accountName:s.account_name,percentageCharge:Number(s.percentage_charge),subaccountCode:s.subaccount_code,verified:null,active:null}:null;
const subaccountCode=z.string().regex(/^RS_[A-Za-z0-9]{1,100}$/);
const fingerprint=(config:Config,mode:string,bank:string,account:string,fee:number)=>accountFingerprint(config,'flutterwave:'+mode,bank,account,fee);
export function flutterwavePayoutCall(context:PaymentContext){
 if(context.provider!=='flutterwave'||!context.secret?.startsWith(context.mode==='live'?'FLWSECK-':'FLWSECK_TEST-'))throw new Failure(503,'flutterwave_setup_required',`Configure the ${context.mode} Flutterwave secret on the admin server to verify banks and create merchant subaccounts.`);
 return async(path:string,body?:unknown):Promise<any>=>{
  if(!path.startsWith('/')||path.startsWith('//')||path.includes('://'))throw Error('Invalid provider path');
  try{
   const response=await fetch('https://api.flutterwave.com/v3'+path,{method:body===undefined?'GET':'POST',redirect:'error',signal:AbortSignal.timeout(12000),headers:{Authorization:`Bearer ${context.secret}`,'Content-Type':'application/json',Accept:'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});
   const reader=response.body?.getReader();if(!reader)throw Error('Missing response');
   const chunks:Uint8Array[]=[];let size=0;
   for(;;){const r=await reader.read();if(r.done)break;size+=r.value.byteLength;if(size>1024*1024){await reader.cancel();throw Error('Oversized response');}chunks.push(r.value);}
   const result=JSON.parse(Buffer.concat(chunks).toString('utf8'));
   if(!response.ok||result?.status!=='success'||result.data==null)throw Error('Unconfirmed provider response');
   return result;
  }catch{throw new Failure(502,'flutterwave_unavailable','Flutterwave could not confirm this request. Check its status before creating another subaccount.');}
 };
}
export function createFlutterwavePayouts({config,db,dbFailure}:{config:Config;db:SupabaseClient;dbFailure:(e:{code?:string}|null)=>never}){
 const cache=new Map<string,{until:number;value:Array<{code:string;name:string}>}>();
 async function assertSelection(context:PaymentContext){
  const current=await backendPaymentSelection(config);
  if(current.paymentProvider!=='flutterwave'||current.paymentMode!==context.mode)throw new Failure(409,'payment_provider_changed','Payment provider or mode changed. Reload payouts and verify the bank account again.');
 }
 async function merchant(id:string){
  const r=await db.from('merchants').select('id,name,contact_email,contact_phone,address,paystack_subaccount,paystack_test_subaccount,flutterwave_subaccount,flutterwave_test_subaccount,created_at,updated_at').eq('id',id).maybeSingle();
  if(r.error)dbFailure(r.error);if(!r.data)throw new Failure(404,'not_found','Save the merchant before configuring its payouts.');return r.data;
 }
 async function readSetup(id:string,mode:PaymentMode):Promise<FlutterwaveSetup|null>{
  const r=await db.from('flutterwave_payout_setups').select(fields).eq('merchant_id',id).eq('domain',mode).maybeSingle();if(r.error)dbFailure(r.error);return r.data;
 }
 async function banks(context:PaymentContext){
  const call=flutterwavePayoutCall(context),cached=cache.get(context.mode);
  if(cached&&cached.until>Date.now())return cached.value;
  const r=await call('/banks/NG');if(!Array.isArray(r.data))throw new Failure(502,'invalid_bank_response','The Nigerian bank list could not be loaded.');
  const values=new Map<string,{code:string;name:string}>();
  for(const b of r.data)if(typeof b.code==='string'&&/^\d{2,12}$/.test(b.code)&&typeof b.name==='string'&&b.name.trim()&&b.name.length<=160)values.set(b.code,{code:b.code,name:b.name.trim()});
  if(!values.size)throw new Failure(502,'invalid_bank_response','The Nigerian bank list could not be loaded.');
  const value=[...values.values()].sort((a,b)=>a.name.localeCompare(b.name));cache.set(context.mode,{until:Date.now()+120000,value});return value;
 }
 async function verify(input:unknown,actor:string,context:PaymentContext){
  const value=z.object({merchantId:z.string().uuid(),bankCode:z.string().regex(/^\d{2,12}$/),accountNumber:z.string().regex(/^\d{10}$/)}).strict().parse(input);
  await merchant(value.merchantId);
  const bank=(await banks(context)).find(b=>b.code===value.bankCode);if(!bank)throw new Failure(400,'invalid_bank','Choose a bank from the current bank list.');
  const r=await flutterwavePayoutCall(context)('/accounts/resolve',{account_bank:bank.code,account_number:value.accountNumber});
  if(r.data?.account_number!==value.accountNumber||typeof r.data.account_name!=='string'||!r.data.account_name.trim()||r.data.account_name.length>200)throw new Failure(502,'account_resolution_failed','The bank account name could not be confirmed. Check the details and verify again.');
  await assertSelection(context);
  const account={actor,merchant:value.merchantId,provider:'flutterwave' as const,mode:context.mode,bankCode:bank.code,bankName:bank.name,accountNumber:value.accountNumber,accountName:r.data.account_name.trim(),expires:Date.now()+5*60000};
  return {provider:'flutterwave',mode:context.mode,bankName:bank.name,accountName:account.accountName,accountLast4:value.accountNumber.slice(-4),verificationToken:sealAccount(config,account),expiresAt:new Date(account.expires).toISOString()};
 }
 function matches(s:FlutterwaveSetup,data:any){
  const meta=Array.isArray(data?.meta)?data.meta:[];
  const tag=(name:string,value:string)=>meta.some((m:any)=>m?.meta_name===name&&m.meta_value===value);
  return Number.isSafeInteger(data?.id)&&data.id>0&&subaccountCode.safeParse(data.subaccount_id).success
   &&data.account_bank===s.bank_code&&typeof data.account_number==='string'&&/^\d{10}$/.test(data.account_number)
   &&data.split_type==='percentage'&&typeof data.split_value==='number'&&Math.abs(data.split_value-Number(s.percentage_charge)/100)<1e-10
   &&fingerprint(config,s.domain,data.account_bank,data.account_number,Number(s.percentage_charge))===s.fingerprint
   &&(!data.country||data.country==='NG')&&tag('paybypalm_setup_id',s.request_id)&&tag('paybypalm_merchant_id',s.merchant_id)&&tag('paybypalm_mode',s.domain);
 }
 async function complete(s:FlutterwaveSetup,data:any,actor:string){
  if(!matches(s,data))throw new Failure(409,'payout_result_mismatch','Flutterwave’s result does not match this merchant’s verified bank setup. Check the original subaccount before retrying.');
  const r=await db.rpc('admin_complete_flutterwave_payout',{p_actor:actor,p_merchant:s.merchant_id,p_domain:s.domain,p_request:s.request_id,p_code:data.subaccount_id,p_provider_id:data.id});
  if(r.error)dbFailure(r.error);return {merchant:r.data.merchant,setup:safeFlutterwaveSetup(r.data.setup)};
 }
 async function create(id:string,input:unknown,actor:string,context:PaymentContext){
  const body=z.object({verificationToken:z.string().min(1).max(3000),percentageCharge:z.number().min(0).max(100).multipleOf(.01),expected:z.string().datetime({offset:true})}).strict().parse(input);
  const account=openAccount(config,body.verificationToken,actor,id,context.mode,'flutterwave'),call=flutterwavePayoutCall(context),m=await merchant(id);
  const phone=typeof m.contact_phone==='string'?m.contact_phone.replace(/[ ()-]/g,''):'';
  if(!/^\+?\d{8,15}$/.test(phone))throw new Failure(400,'merchant_phone_required','Save the merchant’s contact phone before creating its Flutterwave subaccount.');
  await assertSelection(context);
  const r=await db.rpc('admin_begin_flutterwave_payout',{p_actor:actor,p_merchant:id,p_domain:context.mode,p_request:randomUUID(),p_fingerprint:fingerprint(config,context.mode,account.bankCode,account.accountNumber,body.percentageCharge),p_bank_code:account.bankCode,p_bank_name:account.bankName,p_last4:account.accountNumber.slice(-4),p_account_name:account.accountName,p_fee:body.percentageCharge,p_expected:body.expected});
  if(r.error)dbFailure(r.error);const s=r.data.setup as FlutterwaveSetup;
  if(!r.data.claimed)return {merchant:await merchant(id),setup:safeFlutterwaveSetup(s)};
  let posted=false;
  try{
   await assertSelection(context);posted=true;
   const created=await call('/subaccounts',{account_bank:s.bank_code,account_number:account.accountNumber,business_name:m.name,business_mobile:phone,...(m.contact_email?{business_email:m.contact_email}:{}),country:'NG',split_type:'percentage',split_value:Number(s.percentage_charge)/100,
    meta:[{meta_name:'paybypalm_setup_id',meta_value:s.request_id},{meta_name:'paybypalm_merchant_id',meta_value:id},{meta_name:'paybypalm_mode',meta_value:s.domain}]});
   // Save a returned numeric ID before the canonical GET; a later failure uses GET only.
   if(!Number.isSafeInteger(created.data?.id)||created.data.id<=0)throw new Failure(502,'payout_create_unconfirmed','Flutterwave creation is not confirmed. Check status before retrying.');
   const saved=await db.from('flutterwave_payout_setups').update({provider_id:created.data.id}).eq('merchant_id',id).eq('domain',s.domain).eq('request_id',s.request_id).eq('status','submitting');if(saved.error)dbFailure(saved.error);
   const canonical=await call('/subaccounts/'+created.data.id);
   return await complete(s,canonical.data,actor);
  }catch(error){
   // Every possible POST acceptance remains durable. Even a duplicate-account
   // rejection needs review; it is never permission to create another account.
   await db.from('flutterwave_payout_setups').update({status:posted?'needs_review':'rejected',updated_at:new Date().toISOString()}).eq('merchant_id',id).eq('domain',s.domain).eq('request_id',s.request_id).eq('status','submitting');
   throw error;
  }
 }
 async function check(id:string,actor:string,context:PaymentContext){
  const s=await readSetup(id,context.mode);if(!s)throw new Failure(404,'payout_not_found','No Flutterwave setup is recorded for this merchant.');
  if(s.status==='rejected')return {merchant:await merchant(id),setup:safeFlutterwaveSetup(s)};
  const call=flutterwavePayoutCall(context);
  if(s.provider_id)return complete(s,(await call('/subaccounts/'+s.provider_id)).data,actor);
  const candidates:any[]=[];
  for(let page=1;page<=20;page++){
   const r=await call('/subaccounts?'+new URLSearchParams({page:String(page)}));if(!Array.isArray(r.data))throw new Failure(502,'payout_check_unavailable','Flutterwave subaccount status could not be checked.');
   candidates.push(...r.data.filter((v:any)=>matches(s,v)));
   const pages=Number(r.meta?.page_info?.total_pages);
   if(Number.isInteger(pages)&&pages>=0&&page>=pages)break;
   if(!r.data.length)break;
   if(page===20)throw new Failure(409,'payout_check_incomplete','The Flutterwave search could not finish. Locate the original subaccount in Flutterwave; no duplicate was created.');
  }
  if(candidates.length!==1)throw new Failure(409,'payout_needs_review','Creation remains unconfirmed. Check again later or locate the original subaccount in Flutterwave. No duplicate was created.');
  // Always confirm one canonical numeric ID after searching.
  return complete(s,(await call('/subaccounts/'+candidates[0].id)).data,actor);
 }
 return {banks,verify,create,check,readSetup,safe:safeFlutterwaveSetup,settings:paymentSettings};
}
