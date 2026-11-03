/** Live-mode protocol tests. Every provider and database response is mocked. */
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {configSchema} from '../server/config';
import {createFlutterwavePayouts,flutterwavePayoutCall} from '../server/flutterwavePayouts';
import {paymentContext,openAccount,sealAccount} from '../server/paystack';
const actor='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',id='dddddddd-dddd-4ddd-8ddd-dddddddddddd',stamp='2026-10-19T00:00:00Z';
const config=configSchema.parse({NODE_ENV:'test',SUPABASE_URL:'https://fixture.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'fixture',ADMIN_USER_IDS:actor,SESSION_ENCRYPTION_KEY:'a'.repeat(64),PAYMENT_API_BASE_URL:'https://payments.example.test',FLUTTERWAVE_LIVE_SECRET_KEY:'FLWSECK-fixture-X',FLUTTERWAVE_TEST_SECRET_KEY:'FLWSECK_TEST-fixture-X'});
let selection:{paymentProvider:'flutterwave'|'paystack';paymentMode:'live'|'test'},setup:any,merchant:any,record:any,failPost:boolean,failGet:boolean,failComplete:boolean,wrong:boolean,flipAfterClaim:boolean,flipAfterResolve:boolean;
const calls:Array<{path:string;method:string;body:any;secret:string}>=[];
const fetchMock=vi.fn(),rpc=vi.fn(async(name:string,args:any)=>{
 if(name==='admin_begin_flutterwave_payout'){
  if(setup)return {data:{claimed:false,setup},error:null};
  setup={merchant_id:id,domain:args.p_domain,request_id:args.p_request,fingerprint:args.p_fingerprint,bank_code:args.p_bank_code,bank_name:args.p_bank_name,account_name:args.p_account_name,account_last4:args.p_last4,percentage_charge:args.p_fee,status:'submitting',provider_id:null,subaccount_code:null};
  if(flipAfterClaim)selection.paymentMode='test';return {data:{claimed:true,setup:{...setup}},error:null};
 }
 if(name==='admin_complete_flutterwave_payout'){
  if(failComplete)return {data:null,error:{code:'offline'}};
  setup={...setup,status:'created',provider_id:args.p_provider_id,subaccount_code:args.p_code};merchant={...merchant,flutterwave_subaccount:args.p_code};return {data:{merchant,setup},error:null};
 }
 throw Error('Unexpected RPC '+name);
});
const db={rpc,from:(table:string)=>{
 let patch:any;const filters:Array<[string,unknown]>=[];
 const run=()=>{
  if(table==='merchants')return {data:merchant,error:null};
  if(table==='flutterwave_payout_setups'){
   if(patch&&setup&&filters.every(([k,v])=>setup[k]===v))setup={...setup,...patch};
   return {data:setup&&filters.every(([k,v])=>setup[k]===v)?{...setup}:null,error:null};
  }
  throw Error('Unexpected table '+table);
 };
 const q:any={select:()=>q,eq:(k:string,v:unknown)=>{filters.push([k,v]);return q;},update:(p:any)=>{patch=p;return q;},maybeSingle:async()=>run(),then:(yes:any,no:any)=>Promise.resolve(run()).then(yes,no)};return q;
}};
let service:ReturnType<typeof createFlutterwavePayouts>;
const context=()=>paymentContext(config);
const response=(data:any,status=200,extra={})=>new Response(JSON.stringify({status:status===200?'success':'error',data,...extra}),{status});
beforeEach(()=>{
 selection={paymentProvider:'flutterwave',paymentMode:'live'};setup=null;record=null;failPost=false;failGet=false;failComplete=false;wrong=false;flipAfterClaim=false;flipAfterResolve=false;calls.length=0;rpc.mockClear();
 config.FLUTTERWAVE_LIVE_SECRET_KEY='FLWSECK-fixture-X';
 merchant={id,name:'Fixture Stores',contact_phone:'+2348012345678',contact_email:'merchant@example.test',paystack_subaccount:'ACCT_retained',flutterwave_subaccount:null,updated_at:stamp};
 service=createFlutterwavePayouts({config,db:db as any,dbFailure:()=>{throw Error('database unavailable');}});
 fetchMock.mockReset().mockImplementation(async(url:string,opts:any={})=>{
  if(new URL(url).origin===config.PAYMENT_API_BASE_URL)return new Response(JSON.stringify(selection));
  expect(new URL(url).origin).toBe('https://api.flutterwave.com');expect(opts.redirect).toBe('error');expect(opts.signal).toBeInstanceOf(AbortSignal);
  const path=new URL(url).pathname,body=opts.body?JSON.parse(opts.body):undefined;calls.push({path,body,method:opts.method,secret:opts.headers.Authorization});
  if(path==='/v3/banks/NG')return response([{code:'044',name:'Fixture Bank'}]);
  if(path==='/v3/accounts/resolve'){if(flipAfterResolve)selection.paymentMode='test';return response({account_number:body.account_number,account_name:'FIXTURE STORES'});}
  if(path==='/v3/subaccounts'&&opts.method==='POST'){
   record={...body,id:2181,subaccount_id:'RS_fixture',bank_name:'Fixture Bank'};if(failPost)throw Error('lost response after acceptance');return response(record);
  }
  if(path==='/v3/subaccounts/2181'){if(failGet)return response(null,503);return response(wrong?{...record,account_number:'9999999999'}:record);}
  if(path==='/v3/subaccounts')return response(record?[record]:[],200,{meta:{page_info:{total_pages:1}}});
  throw Error('Unexpected provider request');
 });vi.stubGlobal('fetch',fetchMock);
});
afterEach(()=>vi.unstubAllGlobals());
async function verified(){return service.verify({merchantId:id,bankCode:'044',accountNumber:'0123456789'},actor,await context());}
async function create(verificationToken:string,fee=0){return service.create(id,{verificationToken,percentageCharge:fee,expected:stamp},actor,await context());}
it('selects the live key and never falls back to sandbox credentials',async()=>{expect(await context()).toMatchObject({mode:'live',secret:'FLWSECK-fixture-X'});config.FLUTTERWAVE_LIVE_SECRET_KEY=undefined;expect((await context()).secret).toBeUndefined();await expect(service.banks(await context())).rejects.toMatchObject({status:503});expect(calls).toHaveLength(0);});
it('binds bank verification to provider, admin, merchant and live mode without exposing the full number',async()=>{const v=await verified();expect(v).toMatchObject({provider:'flutterwave',mode:'live',accountLast4:'6789',accountName:'FIXTURE STORES'});expect(JSON.stringify(v)).not.toContain('0123456789');expect(()=>openAccount(config,v.verificationToken,actor,id,'live')).toThrow();expect(()=>openAccount(config,v.verificationToken,actor,id,'test','flutterwave')).toThrow();expect(()=>openAccount(config,v.verificationToken,'other',id,'live','flutterwave')).toThrow();expect(openAccount(config,v.verificationToken,actor,id,'live','flutterwave').accountNumber).toBe('0123456789');});
it('persists one creation claim, creates the merchant bank recipient, and verifies it by GET',async()=>{const v=await verified();const result=await create(v.verificationToken,2.5);expect(result).toMatchObject({merchant:{flutterwave_subaccount:'RS_fixture',paystack_subaccount:'ACCT_retained'},setup:{provider:'flutterwave',status:'created',accountLast4:'6789',percentageCharge:2.5,verified:null}});const post=calls.find(c=>c.path==='/v3/subaccounts'&&c.method==='POST')!;expect(post.body).toMatchObject({account_bank:'044',account_number:'0123456789',country:'NG',business_mobile:'+2348012345678',split_type:'percentage',split_value:.025});expect(post.secret).toBe('Bearer FLWSECK-fixture-X');expect(rpc.mock.invocationCallOrder[0]!).toBeLessThan(fetchMock.mock.invocationCallOrder.find((_,i)=>fetchMock.mock.calls[i]?.[1]?.method==='POST'&&String(fetchMock.mock.calls[i]?.[0]).endsWith('/subaccounts'))!);expect(calls.some(c=>c.path==='/v3/subaccounts/2181'&&c.method==='GET')).toBe(true);expect(JSON.stringify(setup)).not.toContain('0123456789');});
it('checks the original setup on retry without a second creation POST',async()=>{const v=await verified();await create(v.verificationToken);await create(v.verificationToken);expect(calls.filter(c=>c.path==='/v3/subaccounts'&&c.method==='POST')).toHaveLength(1);});
it('recovers a lost POST response from the marked collection list using GET only',async()=>{const v=await verified();failPost=true;await expect(create(v.verificationToken)).rejects.toMatchObject({code:'flutterwave_unavailable'});expect(setup.status).toBe('needs_review');const r=await service.check(id,actor,await context());expect(r.setup?.status).toBe('created');expect(calls.filter(c=>c.path==='/v3/subaccounts'&&c.method==='POST')).toHaveLength(1);});
it('recovers an accepted creation after canonical verification failed',async()=>{const v=await verified();failGet=true;await expect(create(v.verificationToken)).rejects.toMatchObject({status:502});expect(setup.provider_id).toBe(2181);failGet=false;expect((await service.check(id,actor,await context())).setup?.status).toBe('created');expect(calls.filter(c=>c.path==='/v3/subaccounts'&&c.method==='POST')).toHaveLength(1);});
it('recovers an accepted creation after its completion database write failed',async()=>{const v=await verified();failComplete=true;await expect(create(v.verificationToken)).rejects.toThrow('database unavailable');failComplete=false;expect((await service.check(id,actor,await context())).setup?.status).toBe('created');expect(calls.filter(c=>c.path==='/v3/subaccounts'&&c.method==='POST')).toHaveLength(1);});
it('rejects a different returned bank account rather than enabling settlement',async()=>{const v=await verified();wrong=true;await expect(create(v.verificationToken)).rejects.toMatchObject({code:'payout_result_mismatch'});expect(merchant.flutterwave_subaccount).toBeNull();expect(setup.status).toBe('needs_review');});
it('rejects mode changes after account resolution',async()=>{flipAfterResolve=true;await expect(verified()).rejects.toMatchObject({code:'payment_provider_changed'});expect(rpc).not.toHaveBeenCalled();});
it('rechecks live selection after the durable claim before any creation POST',async()=>{const v=await verified();flipAfterClaim=true;await expect(create(v.verificationToken)).rejects.toMatchObject({code:'payment_provider_changed'});expect(setup.status).toBe('rejected');expect(calls.some(c=>c.path==='/v3/subaccounts'&&c.method==='POST')).toBe(false);});
it('requires the merchant phone and refuses forged Paystack verification tokens before claiming',async()=>{const v=await verified();merchant.contact_phone=null;await expect(create(v.verificationToken)).rejects.toMatchObject({code:'merchant_phone_required'});expect(rpc).not.toHaveBeenCalled();const token=sealAccount(config,{actor,merchant:id,mode:'live',bankCode:'044',bankName:'Fixture',accountNumber:'0123456789',accountName:'Fixture',expires:Date.now()+60000});await expect(create(token)).rejects.toMatchObject({code:'account_verification_expired'});});
it.each(['invalid JSON','x'.repeat(1024*1024+1)])('rejects malformed or oversized provider responses without leaking values',async body=>{const ctx=await context();fetchMock.mockResolvedValue(new Response(body));await expect(flutterwavePayoutCall(ctx)('/banks/NG')).rejects.toMatchObject({status:502});});
it('keeps a missing/ambiguous recovery result unresolved without another POST',async()=>{const v=await verified();failPost=true;await expect(create(v.verificationToken)).rejects.toThrow();record=null;await expect(service.check(id,actor,await context())).rejects.toMatchObject({code:'payout_needs_review'});expect(calls.filter(c=>c.path==='/v3/subaccounts'&&c.method==='POST')).toHaveLength(1);});
