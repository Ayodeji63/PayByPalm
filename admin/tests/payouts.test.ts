import {beforeAll,afterAll,beforeEach,describe,it,expect,vi} from 'vitest';
import type {Server} from 'node:http';
import {createApp} from '../server/app';
import {configSchema} from '../server/config';
import {seal,COOKIE} from '../server/session';
import {sealAccount} from '../server/paystack';
const actor='aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',id='dddddddd-dddd-4ddd-dddd-dddddddddddd';
const config=configSchema.parse({NODE_ENV:'test',SUPABASE_URL:'https://example.supabase.co',SUPABASE_ANON_KEY:'fixture',SUPABASE_SERVICE_ROLE_KEY:'fixture',ADMIN_USER_IDS:actor,SESSION_ENCRYPTION_KEY:'a'.repeat(64),PAYSTACK_MODE:'test',PAYSTACK_SECRET_KEY:'sk_test_fixture'});
const stamp='2026-10-19T00:00:00Z',bank={code:'058',name:'Guaranty Trust Bank',active:true,currency:'NGN'};
let setup:any,merchant:any,providerRecords:any[],failPost:string|null,failComplete:boolean,failFetch:boolean,wrongResult:boolean,adminAllowed:boolean;
const nativeFetch=globalThis.fetch,providerCalls:Array<{path:string;method:string;body:any}>=[];
const rpc=vi.fn(async(name:string,args:any)=>{
 if(name==='consume_api_budget')return {data:0,error:null};
 if(name==='admin_begin_payout'){
  if(setup&&setup.status!=='rejected')return {data:{claimed:false,setup:{...setup}},error:null};
  setup={merchant_id:id,domain:args.p_domain,request_id:args.p_request,fingerprint:args.p_fingerprint,bank_code:args.p_bank_code,bank_name:args.p_bank_name,account_name:args.p_account_name,account_last4:args.p_last4,percentage_charge:args.p_fee,status:'submitting',subaccount_code:null};
  return {data:{claimed:true,setup:{...setup}},error:null};
 }
 if(name==='admin_complete_payout'){
  if(failComplete)return {data:null,error:{code:'offline'}};
  setup={...setup,status:'created',subaccount_code:args.p_code,provider_verified:args.p_verified,provider_active:args.p_active};
  merchant={...merchant,[args.p_domain==='live'?'paystack_subaccount':'paystack_test_subaccount']:args.p_code};
  return {data:{merchant,setup},error:null};
 }
 throw Error('Unexpected RPC '+name);
});
const db={rpc,from:(table:string)=>{
 let patch:any;const filters:Array<[string,any]>=[];
 const run=()=>{
  if(table==='admin_sessions')return {data:{user_id:actor,expires_at:new Date(Date.now()+60000).toISOString(),revoked_at:null},error:null};
  if(table==='merchants')return {data:merchant,error:null};
  if(table==='merchant_payout_setups'){
   if(patch&&setup&&filters.every(([k,v])=>setup[k]===v))setup={...setup,...patch};
   return {data:setup,error:null};
  }
  throw Error('Unexpected table');
 };
 const q:any={select:()=>q,eq:(k:string,v:any)=>{filters.push([k,v]);return q;},update:(value:any)=>{patch=value;return q;},maybeSingle:async()=>run(),then:(r:any,j:any)=>Promise.resolve(run()).then(r,j)};return q;
}};
let server:Server,base:string;
const cookie=()=>COOKIE+'='+seal({id:'cccccccc-cccc-4ccc-cccc-cccccccccccc',access:'fixture-access',refresh:'fixture-refresh',startedAt:Date.now()},config.SESSION_ENCRYPTION_KEY);
const send=(path:string,body?:unknown,authenticated=true)=>nativeFetch(base+'/api'+path,{method:body===undefined?'GET':'POST',headers:{...(body===undefined?{}:{'Content-Type':'application/json',Origin:config.APP_ORIGIN}),...(authenticated?{Cookie:cookie()}: {})},...(body===undefined?{}:{body:JSON.stringify(body)})});
const json=(data:any,status=200)=>new Response(JSON.stringify({status:status<400,data}),{status,headers:{'Content-Type':'application/json'}});
beforeAll(async()=>{
 server=createApp({config,db:db as any,auth:()=>({auth:{getUser:async()=>({data:{user:{id:adminAllowed?actor:'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb',email_confirmed_at:stamp}},error:null})}}) as any,serveFrontend:false}).listen(0,'127.0.0.1');
 await new Promise<void>(r=>server.once('listening',r));base=`http://127.0.0.1:${(server.address() as any).port}`;
});
afterAll(async()=>{vi.unstubAllGlobals();server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));});
beforeEach(()=>{
 config.PAYSTACK_MODE='test';config.PAYSTACK_SECRET_KEY='sk_test_fixture';
 setup=null;merchant={id,name:'Ayo Stores',paystack_subaccount:'ACCT_existingLive',paystack_test_subaccount:null,updated_at:stamp};
 providerRecords=[];providerCalls.length=0;failPost=null;failComplete=false;failFetch=false;wrongResult=false;adminAllowed=true;rpc.mockClear();
 vi.stubGlobal('fetch',vi.fn(async(url:string,options:any={})=>{
  const path=new URL(url).pathname,body=options.body?JSON.parse(options.body):null;
  providerCalls.push({path,method:options.method,body});
  expect(new URL(url).origin).toBe('https://api.paystack.co');expect(options.redirect).toBe('error');
  if(path==='/bank')return json([bank]);
  if(path==='/bank/resolve')return json({account_number:'0123456789',account_name:'AYO STORES'});
  if(path==='/subaccount'&&options.method==='POST'){
   if(failPost==='rejected')return json(null,400);
   const record={...body,subaccount_code:'ACCT_newFixture',domain:wrongResult?'live':config.PAYSTACK_MODE,currency:'NGN',settlement_bank:bank.name,is_verified:false,active:true};providerRecords.push(record);
   if(failPost==='timeout')throw Error('Private provider transport details');return json(record,201);
  }
  if(path==='/subaccount')return json(providerRecords);
  if(path.startsWith('/subaccount/'))return failFetch?json(null,404):json(providerRecords[0]);
  throw Error('Unexpected provider request');
 }));
});
async function verification(){const r=await send('/payouts/verify',{merchantId:id,bankCode:'058',accountNumber:'0123456789'});expect(r.status).toBe(200);return r.json();}
const creation=(token:string,extra={})=>({verificationToken:token,percentageCharge:0,expected:stamp,...extra});
describe('admin bank payout onboarding',()=>{
 it('requires allowed admin access before all provider calls',async()=>{
  expect((await send('/payouts/banks',undefined,false)).status).toBe(401);
  adminAllowed=false;expect((await send('/payouts/banks')).status).toBe(403);expect(providerCalls).toEqual([]);
 });
 it('rejects cross-origin writes before resolving an account',async()=>{
  const r=await nativeFetch(base+'/api/payouts/verify',{method:'POST',headers:{Origin:'https://attacker.test','Content-Type':'application/json',Cookie:cookie()},body:'{}'});
  expect(r.status).toBe(403);expect(providerCalls).toHaveLength(0);
 });
 it('returns an encrypted, actor/merchant/mode-bound confirmation without returning the account number',async()=>{
  const v=await verification();expect(v).toMatchObject({accountName:'AYO STORES',accountLast4:'6789',mode:'test'});
  expect(JSON.stringify(v)).not.toContain('0123456789');expect(providerCalls.some(c=>c.method==='POST')).toBe(false);
 });
 it('creates and saves one sandbox subaccount while retaining live settlement and pending Paystack verification',async()=>{
  const v=await verification();const r=await send(`/merchants/${id}/payout`,creation(v.verificationToken));expect(r.status).toBe(201);
  const result=await r.json();expect(result.setup).toMatchObject({status:'created',mode:'test',verified:false,subaccountCode:'ACCT_newFixture'});
  expect(result.merchant.paystack_subaccount).toBe('ACCT_existingLive');expect(result.merchant.paystack_test_subaccount).toBe('ACCT_newFixture');
  expect(providerCalls.find(c=>c.method==='POST')!.body).toMatchObject({business_name:'Ayo Stores',settlement_bank:'058',account_number:'0123456789',percentage_charge:0});
  expect(JSON.stringify(result.setup)).not.toContain('0123456789');
 });
 it('serializes concurrent create requests before calling Paystack',async()=>{
  const v=await verification();await Promise.all([send(`/merchants/${id}/payout`,creation(v.verificationToken)),send(`/merchants/${id}/payout`,creation(v.verificationToken))]);
  expect(providerCalls.filter(c=>c.method==='POST')).toHaveLength(1);
 });
 it('recovers a timeout using list/fetch GETs and never repeats creation POST',async()=>{
  const v=await verification();failPost='timeout';
  expect((await send(`/merchants/${id}/payout`,creation(v.verificationToken))).status).toBe(502);expect(setup.status).toBe('needs_review');
  expect((await send(`/merchants/${id}/payout`,creation(v.verificationToken))).status).toBe(200);
  expect((await send(`/merchants/${id}/payout/check`,{})).status).toBe(200);expect(setup.status).toBe('created');
  expect(providerCalls.filter(c=>c.method==='POST')).toHaveLength(1);
 });
 it('recovers a provider success followed by database failure without creating a duplicate',async()=>{
  const v=await verification();failComplete=true;
  expect((await send(`/merchants/${id}/payout`,creation(v.verificationToken))).status).toBe(503);
  failComplete=false;expect((await send(`/merchants/${id}/payout/check`,{})).status).toBe(200);
  expect(providerCalls.filter(c=>c.method==='POST')).toHaveLength(1);
 });
 it('never treats a verification GET failure as permission to repeat an accepted creation POST',async()=>{
  const v=await verification();failFetch=true;
  expect((await send(`/merchants/${id}/payout`,creation(v.verificationToken))).status).toBe(502);expect(setup.status).toBe('needs_review');
  await send(`/merchants/${id}/payout`,creation(v.verificationToken));
  expect(providerCalls.filter(c=>c.method==='POST')).toHaveLength(1);
  failFetch=false;expect((await send(`/merchants/${id}/payout/check`,{})).status).toBe(200);
 });
 it('retains unresolved setup when Paystack cannot find the original account',async()=>{
  const v=await verification();failPost='timeout';await send(`/merchants/${id}/payout`,creation(v.verificationToken));providerRecords=[];
  const r=await send(`/merchants/${id}/payout/check`,{});expect(r.status).toBe(409);expect(setup.status).toBe('needs_review');
  expect(providerCalls.filter(c=>c.method==='POST')).toHaveLength(1);
 });
 it('rejects a provider response for another mode without binding it',async()=>{
  const v=await verification();wrongResult=true;expect((await send(`/merchants/${id}/payout`,creation(v.verificationToken))).status).toBe(409);
  expect(merchant.paystack_test_subaccount).toBeNull();expect(setup.status).toBe('needs_review');
 });
 it.each(['tampered','expired','actor','merchant','mode'])('rejects %s verification before provider creation',async kind=>{
  const value={actor,merchant:id,mode:'test' as const,bankCode:'058',bankName:bank.name,accountNumber:'0123456789',accountName:'AYO STORES',expires:Date.now()+60000};
  if(kind==='expired')value.expires=Date.now()-1000;
  if(kind==='actor')value.actor='bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb';
  if(kind==='merchant')value.merchant='bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb';
  let token=sealAccount(config,value);if(kind==='tampered')token='!'+token.slice(2);
  if(kind==='mode'){config.PAYSTACK_MODE='live';config.PAYSTACK_SECRET_KEY='sk_live_fixture';}
  expect((await send(`/merchants/${id}/payout`,creation(token))).status).toBe(409);expect(providerCalls).toHaveLength(0);
 });
 it.each([{percentageCharge:-1},{percentageCharge:101},{accountNumber:'9999999999'},{subaccountCode:'ACCT_forged'}])('rejects invalid fees and injected provider fields %j',async patch=>{
  const v=await verification();expect((await send(`/merchants/${id}/payout`,creation(v.verificationToken,patch))).status).toBe(400);
  expect(providerCalls.filter(c=>c.method==='POST')).toHaveLength(0);
 });
 it('records a definite Paystack rejection without claiming the account exists',async()=>{
  const v=await verification();failPost='rejected';const r=await send(`/merchants/${id}/payout`,creation(v.verificationToken));
  expect(r.status).toBe(502);expect(setup.status).toBe('rejected');expect(merchant.paystack_test_subaccount).toBeNull();
  expect(JSON.stringify(await r.json())).not.toContain('0123456789');
 });
});


describe('admin Paystack configuration',()=>{
 const base={NODE_ENV:'test',SUPABASE_URL:'https://example.supabase.co',SUPABASE_ANON_KEY:'fixture',SUPABASE_SERVICE_ROLE_KEY:'fixture',ADMIN_USER_IDS:actor,SESSION_ENCRYPTION_KEY:'a'.repeat(64)};
 it('leaves ordinary admin operations available with no payment key',()=>{expect(configSchema.safeParse(base).success).toBe(true);});
 it('rejects a live secret in default test mode',()=>{expect(configSchema.safeParse({...base,PAYSTACK_SECRET_KEY:'sk_live_fixture'}).success).toBe(false);});
 it('accepts an explicit matching live configuration',()=>{expect(configSchema.safeParse({...base,PAYSTACK_MODE:'live',PAYSTACK_SECRET_KEY:'sk_live_fixture'}).success).toBe(true);});
});
