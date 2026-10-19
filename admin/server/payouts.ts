import {randomUUID} from 'node:crypto';
import type {Express,RequestHandler} from 'express';
import type {SupabaseClient} from '@supabase/supabase-js';
import {z} from 'zod';
import type {Config} from './config.js';
import {Failure} from './failure.js';
import {provider,paymentSettings,sealAccount,openAccount,accountFingerprint,ProviderFailure} from './paystack.js';

type Bank={code:string;name:string};
type Setup={merchant_id:string;domain:'test'|'live';request_id:string;fingerprint:string;bank_code:string;bank_name:string;account_last4:string;account_name:string;percentage_charge:number;status:string;subaccount_code:string|null;provider_verified:boolean|null;provider_active:boolean|null};
const setupFields='merchant_id,domain,request_id,fingerprint,bank_code,bank_name,account_last4,account_name,percentage_charge,status,subaccount_code,provider_verified,provider_active';
const safe=(s:Setup|null)=>s?{status:s.status,mode:s.domain,bankName:s.bank_name,accountLast4:s.account_last4,accountName:s.account_name,percentageCharge:Number(s.percentage_charge),subaccountCode:s.subaccount_code,verified:s.provider_verified,active:s.provider_active}:null;
const marker=(s:Setup)=>`PayByPalm payout ${s.merchant_id}:${s.request_id}`;
export function mountPayoutRoutes(app:Express,{config,db,writes,dbFailure}:{config:Config;db:SupabaseClient;writes:RequestHandler;dbFailure:(e:{code?:string}|null)=>never}){
 const call=provider(config);let cachedBanks:{until:number;value:Bank[]}|undefined;
 async function banks(){
  if(cachedBanks&&cachedBanks.until>Date.now())return cachedBanks.value;
  const result:Bank[]=[];
  for(let page=1;page<=20;page++){
   const r=await call(`/bank?country=nigeria&currency=NGN&use_cursor=false&perPage=100&page=${page}`);
   if(!Array.isArray(r.data))throw new Failure(502,'invalid_bank_response','The bank list could not be loaded. Please try again.');
   for(const b of r.data)if(b.active===true&&b.currency==='NGN'&&typeof b.code==='string'&&/^\d{2,12}$/.test(b.code)&&typeof b.name==='string'&&b.name.length<=160)result.push({code:b.code,name:b.name});
   if(r.data.length<100){cachedBanks={until:Date.now()+120_000,value:[...new Map(result.map(b=>[b.code,b])).values()].sort((a,b)=>a.name.localeCompare(b.name))};return cachedBanks.value;}
  }
  throw new Failure(502,'bank_list_incomplete','The bank list could not finish loading. Please try again.');
 }
 async function readSetup(id:string){
  const r=await db.from('merchant_payout_setups').select(setupFields).eq('merchant_id',id).eq('domain',config.PAYSTACK_MODE).maybeSingle();
  if(r.error)dbFailure(r.error);return r.data as Setup|null;
 }
 async function merchant(id:string){
  const r=await db.from('merchants').select('id,name,contact_email,contact_phone,address,paystack_subaccount,paystack_test_subaccount,created_at,updated_at').eq('id',id).maybeSingle();
  if(r.error)dbFailure(r.error);if(!r.data)throw new Failure(404,'not_found','Save the merchant before configuring its payouts.');return r.data;
 }
 const codeFor=(m:any)=>config.PAYSTACK_MODE==='live'?m.paystack_subaccount:m.paystack_test_subaccount;
 function matches(s:Setup,data:any,requireMarker=true){
  return data?.domain===s.domain&&data.currency==='NGN'&&/^ACCT_[A-Za-z0-9]{1,80}$/.test(data.subaccount_code??'')&&
   typeof data.account_number==='string'&&/^\d{10}$/.test(data.account_number)&&
   typeof data.settlement_bank==='string'&&data.settlement_bank.trim().toLowerCase()===s.bank_name.trim().toLowerCase()&&
   Number(data.percentage_charge)===Number(s.percentage_charge)&&
   accountFingerprint(config,s.domain,s.bank_code,data.account_number,Number(s.percentage_charge))===s.fingerprint&&
   typeof data.is_verified==='boolean'&&typeof data.active==='boolean'&&(!requireMarker||data.description===marker(s));
 }
 async function complete(s:Setup,data:any,actor:string,requireMarker=true){
  if(!matches(s,data,requireMarker))throw new Failure(409,'payout_result_mismatch','Paystack’s result needs review. Check status; do not create another payout account.');
  const r=await db.rpc('admin_complete_payout',{p_actor:actor,p_merchant:s.merchant_id,p_domain:s.domain,p_request:s.request_id,p_code:data.subaccount_code,p_verified:data.is_verified,p_active:data.active});
  if(r.error)dbFailure(r.error);return {merchant:r.data.merchant,setup:safe(r.data.setup)};
 }
 app.get('/api/payouts/settings',(_req,res)=>res.json(paymentSettings(config)));
 app.get('/api/payouts/banks',async(_req,res)=>res.json({...paymentSettings(config),banks:await banks()}));
 app.post('/api/payouts/verify',writes,async(req,res)=>{
  const input=z.object({merchantId:z.string().uuid(),bankCode:z.string().regex(/^\d{2,12}$/),accountNumber:z.string().regex(/^\d{10}$/)}).strict().parse(req.body);
  await merchant(input.merchantId);
  const bank=(await banks()).find(b=>b.code===input.bankCode);if(!bank)throw new Failure(400,'invalid_bank','Choose a bank from the current bank list.');
  const r=await call('/bank/resolve?'+new URLSearchParams({account_number:input.accountNumber,bank_code:bank.code}));
  if(r.data?.account_number!==input.accountNumber||typeof r.data.account_name!=='string'||!r.data.account_name.trim()||r.data.account_name.length>200)throw new Failure(502,'account_resolution_failed','The bank account name could not be confirmed. Check the details and verify again.');
  const value={actor:res.locals.admin.id,merchant:input.merchantId,mode:config.PAYSTACK_MODE,bankCode:bank.code,bankName:bank.name,accountNumber:input.accountNumber,accountName:r.data.account_name.trim(),expires:Date.now()+5*60_000};
  res.json({mode:value.mode,bankName:bank.name,accountName:value.accountName,accountLast4:input.accountNumber.slice(-4),verificationToken:sealAccount(config,value),expiresAt:new Date(value.expires).toISOString()});
 });
 app.get('/api/merchants/:id/payout',async(req,res)=>{
  const id=z.string().uuid().parse(req.params.id);const m=await merchant(id);
  res.json({...paymentSettings(config),setup:safe(await readSetup(id)),subaccountCode:codeFor(m)});
 });
 app.post('/api/merchants/:id/payout',writes,async(req,res)=>{
  const id=z.string().uuid().parse(req.params.id);
  const input=z.object({verificationToken:z.string().min(1).max(3000),percentageCharge:z.number().min(0).max(100).multipleOf(0.01),expected:z.string().datetime({offset:true})}).strict().parse(req.body);
  const value=openAccount(config,input.verificationToken,res.locals.admin.id,id);
  if(!config.PAYSTACK_SECRET_KEY)throw new Failure(503,'paystack_setup_required','Configure Paystack on the admin server before creating payout accounts.');
  const request=randomUUID();
  const r=await db.rpc('admin_begin_payout',{p_actor:res.locals.admin.id,p_merchant:id,p_domain:value.mode,p_request:request,p_fingerprint:accountFingerprint(config,value.mode,value.bankCode,value.accountNumber,input.percentageCharge),p_bank_code:value.bankCode,p_bank_name:value.bankName,p_last4:value.accountNumber.slice(-4),p_account_name:value.accountName,p_fee:input.percentageCharge,p_expected:input.expected});
  if(r.error)dbFailure(r.error);
  const s=r.data.setup as Setup;
  if(!r.data.claimed){res.json({merchant:await merchant(id),setup:safe(s)});return;}
  let posted=false,postComplete=false;
  try{
   const m=await merchant(id);
   posted=true;
   const created=await call('/subaccount',{business_name:m.name,bank_code:s.bank_code,settlement_bank:s.bank_code,account_number:value.accountNumber,percentage_charge:Number(s.percentage_charge),description:marker(s),metadata:JSON.stringify({paybypalm_merchant_id:id,paybypalm_setup_id:s.request_id,mode:s.domain})});
   postComplete=true;
   const code=created.data?.subaccount_code;
   if(!/^ACCT_[A-Za-z0-9]{1,80}$/.test(code??''))throw new Failure(502,'payout_create_unconfirmed','Paystack creation needs review. Check the original request before retrying.');
   const canonical=await call('/subaccount/'+encodeURIComponent(code));
   res.status(201).json(await complete(s,canonical.data,res.locals.admin.id));
  }catch(e){
   // Once POST might have reached Paystack, never automatically POST again.
   const status=!posted||(!postComplete&&e instanceof ProviderFailure&&e.definitive)?'rejected':'needs_review';
   await db.from('merchant_payout_setups').update({status,updated_at:new Date().toISOString()}).eq('merchant_id',id).eq('domain',s.domain).eq('request_id',s.request_id).eq('status','submitting');
   throw e;
  }
 });
 app.post('/api/merchants/:id/payout/check',writes,async(req,res)=>{
  const id=z.string().uuid().parse(req.params.id);z.object({}).strict().parse(req.body);
  const s=await readSetup(id);if(!s)throw new Failure(404,'payout_not_found','No payout setup is recorded. Verify the merchant’s bank account first.');
  if(s.status==='rejected'){res.json({merchant:await merchant(id),setup:safe(s)});return;}
  if(s.subaccount_code){const r=await call('/subaccount/'+encodeURIComponent(s.subaccount_code));res.json(await complete(s,r.data,res.locals.admin.id,false));return;}
  const candidates:any[]=[];
  // List may omit verification flags; fetch the exact marked account before saving.
  for(let page=1;page<=20;page++){
   const r=await call(`/subaccount?perPage=100&page=${page}`);
   if(!Array.isArray(r.data))throw new Failure(502,'payout_check_unavailable','Payout status could not be checked. Try again later.');
   candidates.push(...r.data.filter((d:any)=>d.description===marker(s)));
   const pages=Number(r.meta?.pageCount);
   if(r.data.length<100||(Number.isFinite(pages)&&page>=pages))break;
   if(page===20)throw new Failure(409,'payout_check_incomplete','The Paystack search could not finish. Ask support to locate the original payout account.');
  }
  if(candidates.length!==1)throw new Failure(409,'payout_needs_review','Creation is not confirmed. Check again later or locate the original subaccount in Paystack; no duplicate was created.');
  const code=candidates[0].subaccount_code;if(!/^ACCT_[A-Za-z0-9]{1,80}$/.test(code??''))throw new Failure(502,'payout_check_unavailable','Payout status could not be checked.');
  const r=await call('/subaccount/'+encodeURIComponent(code));res.json(await complete(s,r.data,res.locals.admin.id));
 });
}
