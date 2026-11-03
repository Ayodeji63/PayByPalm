import { beforeEach,describe,expect,it,vi } from 'vitest';
const state=vi.hoisted(()=>({attempt:null as any,cards:[] as any[],fetch:vi.fn(),rpc:vi.fn()}));
vi.mock('../config.js',()=>({config:{PAYSTACK_SECRET_KEY:'sk_test_fixture',FLUTTERWAVE_TEST_SECRET_KEY:'FLWSECK_TEST-fixture',CARD_TOKEN_ENCRYPTION_KEY:Buffer.alloc(32,7).toString('base64'),WALLET_BASE_URL:'https://wallet.example.test'}}));
vi.mock('../logger.js',()=>({logger:{info:vi.fn(),warn:vi.fn()}}));
vi.mock('../db/client.js',()=>({db:{
 rpc:state.rpc,
 from:()=>{
  let patch:any;const filters:Array<[string,unknown]>=[];
  const run=(single=false)=>{
   if(filters.some(([k,v])=>state.attempt?.[k]!==v))return {data:single?null:[],error:null};
   if(patch)Object.assign(state.attempt,patch);
   return {data:single?{...state.attempt}:[{...state.attempt}],error:null};
  };
  const q:any={insert:(value:any)=>{state.attempt={...value,id:'new',status:'initializing',init_started_at:null,checkout_url:null};return q;},select:()=>q,eq:(k:string,v:unknown)=>{filters.push([k,v]);return q;},is:(k:string,v:unknown)=>{filters.push([k,v]);return q;},update:(p:any)=>{patch=p;return q;},single:async()=>run(true),maybeSingle:async()=>run(true),then:(resolve:any,reject:any)=>Promise.resolve(run()).then(resolve,reject)};
  return q;
 }
}}));
import { processCardLink,verifiedPayment,verifiedCard,ownedAttempt,initializeCardLink,editCard } from './cardLinkService.js';
import { sealAuthorization,openAuthorization,checkoutUrl,validPaystackSignature } from './paystack.js';
import { createHmac } from 'node:crypto';
const reference='pbp_card_'+'a'.repeat(32);
const userId='aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';
function payment(){return {id:123,reference,status:'success',domain:'test',amount:5000,currency:'NGN',channel:'card',customer:{email:'user@example.test'},metadata:{purpose:'card_link',user_id:userId,request_id:'request'},authorization:{authorization_code:'AUTH_secretfixture',signature:'SIG_fixture',channel:'card',card_type:'visa',bank:'Test Bank',last4:'4081',exp_month:'12',exp_year:'2098',reusable:true}};}
function refund(status='pending'){return {id:456,transaction:123,amount:5000,currency:'NGN',domain:'test',status};}
beforeEach(()=>{
 vi.stubGlobal('fetch',state.fetch);state.fetch.mockReset();state.cards=[];
 state.attempt={id:'attempt',reference,user_id:userId,email:'user@example.test',request_id:'request',domain:'test',provider:'paystack',amount_minor:5000,status:'pending',refund_status:'not_requested',provider_transaction_id:null,card_id:null};
 state.rpc.mockReset().mockImplementation(async(name,args)=>{
  if(name==='claim_card_link'){
   if(state.attempt.lease_owner)return {data:[],error:null};
   state.attempt.lease_owner=args.p_owner;return {data:[{...state.attempt}],error:null};
  }
  if(name==='complete_card_link'){
   if(args.p_card)state.cards.push(args.p_card);
   Object.assign(state.attempt,{status:args.p_card?'verified':'unsupported',provider_transaction_id:args.p_transaction_id,card_id:args.p_card?'card':null});
   return {data:null,error:null};
  }
  throw new Error('Unexpected RPC');
 });
 state.fetch.mockImplementation(async(url,options)=>({ok:true,json:async()=>({status:true,data:String(url).includes('/transaction/verify/')?payment():options.method==='POST'?refund():[refund('processed')]})}));
});
describe('verified card linking',()=>{
 it('rejects stale live checkout consent while backend is test before any provider or DB mutation',async()=>{
  const previous=JSON.stringify(state.attempt);
  await expect(initializeCardLink(userId,'user@example.test','request','live')).rejects.toMatchObject({status:409,code:'payment_mode_changed'});
  expect(JSON.stringify(state.attempt)).toBe(previous);expect(state.fetch).not.toHaveBeenCalled();expect(state.rpc).not.toHaveBeenCalled();
 });
 it('rejects stale-mode card edits without changing the card',async()=>{
  await expect(editCard(userId,'card','remove','live')).rejects.toMatchObject({status:409,code:'payment_mode_changed'});
  expect(state.rpc).not.toHaveBeenCalled();
 });
 it('does not reuse an earlier environment checkout even with the same request ID',async()=>{
  state.attempt.domain='live';state.attempt.checkout_url='https://checkout.paystack.com/old';
  state.fetch.mockImplementation(async(_url,options)=>({ok:true,json:async()=>({status:true,data:{reference:JSON.parse(options.body).reference,authorization_url:'https://checkout.paystack.com/new'}})}));
  const result=await initializeCardLink(userId,'user@example.test','request','test');expect(result.checkoutUrl).toBe('https://checkout.paystack.com/new');expect(state.attempt.domain).toBe('test');
 });

 it.each([
  {status:'failed'},{reference:'other'},{domain:'live'},{amount:1},{amount:-5000},{amount:'5000'},{currency:'USD'},
  {customer:{email:'attacker@example.test'}},{metadata:{purpose:'card_link',user_id:'other',request_id:'request'}},{id:0},
 ])('rejects transaction binding mismatch %j',patch=>{expect(verifiedPayment(state.attempt,{...payment(),...patch})).toBe(false);});
 it('initializes only a server-priced card checkout with a fixed callback and verified email',async()=>{
  Object.assign(state.attempt,{status:'initializing',init_started_at:null,checkout_url:null});
  state.fetch.mockResolvedValue({ok:true,json:async()=>({status:true,data:{reference,authorization_url:'https://checkout.paystack.com/abc'}})});
  const result=await initializeCardLink(userId,'user@example.test','request','test');
  expect(result.checkoutUrl).toBe('https://checkout.paystack.com/abc');
  const body=JSON.parse(state.fetch.mock.calls[0]![1].body);
  expect(body).toMatchObject({email:'user@example.test',amount:'5000',currency:'NGN',channels:['card'],reference,callback_url:'https://wallet.example.test/cards'});
  await initializeCardLink(userId,'user@example.test','request','test');expect(state.fetch).toHaveBeenCalledTimes(1);
 });
 it('uses verified masked card details and encrypted authorization credentials',async()=>{
  await processCardLink(reference);
  expect(state.cards).toHaveLength(1);expect(state.cards[0]).toMatchObject({last4:'4081',exp_month:'12',exp_year:'2098',bank:'Test Bank'});
  expect(state.cards[0].authorization_ciphertext).not.toContain('AUTH_');
  expect(openAuthorization(userId,state.cards[0].authorization_ciphertext)).toMatchObject({email:'user@example.test',authorization:{authorization_code:'AUTH_secretfixture'}});
  expect(state.attempt.refund_status).toBe('pending');
 });
 it('does not accept or refund a payment with mismatched ownership',async()=>{
  state.fetch.mockResolvedValue({ok:true,json:async()=>({status:true,data:{...payment(),customer:{email:'other@example.test'}}})});
  await processCardLink(reference);expect(state.cards).toHaveLength(0);expect(state.attempt.status).toBe('invalid');expect(state.fetch).toHaveBeenCalledTimes(1);
 });
 it('returns not found for another user before provider verification',async()=>{
  await expect(ownedAttempt('other',reference)).rejects.toMatchObject({status:404});expect(state.fetch).not.toHaveBeenCalled();
 });
 it('issues one refund and reconciles its processed status on replay',async()=>{
  await processCardLink(reference);await processCardLink(reference);await processCardLink(reference);
  expect(state.cards).toHaveLength(1);expect(state.attempt.refund_status).toBe('processed');
  expect(state.fetch.mock.calls.filter(([,o])=>o.method==='POST')).toHaveLength(1);
 });
 it('never retries a refund POST after an ambiguous timeout',async()=>{
  let first=true;
  state.fetch.mockImplementation(async(url,options)=>{
   if(options.method==='POST'&&first){first=false;throw new Error('connection lost after provider acceptance');}
   return {ok:true,json:async()=>({status:true,data:String(url).includes('/transaction/verify/')?payment():[refund('processed')]})};
  });
  await expect(processCardLink(reference)).rejects.toMatchObject({code:'payment_service_unavailable'});
  expect(state.attempt.refund_status).toBe('submitting');
  await processCardLink(reference);expect(state.attempt.refund_status).toBe('processed');
  expect(state.fetch.mock.calls.filter(([,o])=>o.method==='POST')).toHaveLength(1);
 });
 it('flags ambiguous missing refund for review rather than sending another refund',async()=>{
  state.attempt.status='verified';state.attempt.provider_transaction_id='123';state.attempt.refund_status='submitting';
  state.fetch.mockResolvedValue({ok:true,json:async()=>({status:true,data:[]})});
  await processCardLink(reference);expect(state.attempt.refund_status).toBe('manual_review');expect(state.fetch.mock.calls.some(([,o])=>o.method==='POST')).toBe(false);
 });
 it('refunds an unsupported nonreusable card without saving it',async()=>{
  state.fetch.mockImplementation(async(url)=>({ok:true,json:async()=>({status:true,data:String(url).includes('/transaction/verify/')?{...payment(),authorization:{...payment().authorization,reusable:false}}:refund()})}));
  await processCardLink(reference);expect(state.cards).toHaveLength(0);expect(state.attempt.status).toBe('unsupported');expect(state.attempt.refund_status).toBe('pending');
 });
 it('serializes concurrent processing with a database lease',async()=>{
  let resolve!:()=>void;const pending=new Promise<void>(r=>{resolve=r;});
  state.fetch.mockImplementation(async(url)=>{await pending;return {ok:true,json:async()=>({status:true,data:String(url).includes('/transaction/verify/')?payment():refund()})};});
  const first=processCardLink(reference);await Promise.resolve();await processCardLink(reference);resolve();await first;
  expect(state.cards).toHaveLength(1);expect(state.fetch.mock.calls.filter(([url])=>String(url).endsWith('/refund'))).toHaveLength(1);
 });
 it.each(['failed'])('records declined/incomplete payment %s without saving or refunding',async status=>{
  state.fetch.mockResolvedValue({ok:true,json:async()=>({status:true,data:{...payment(),status}})});
  await processCardLink(reference);expect(state.cards).toHaveLength(0);expect(state.attempt.status).toBe('failed');
  expect(state.attempt.refund_status).toBe('not_requested');expect(state.fetch).toHaveBeenCalledTimes(1);
 });
 it.each(['pending','ongoing','processing','abandoned'])('does not accept a payment still awaiting authentication: %s',async status=>{
  state.fetch.mockResolvedValue({ok:true,json:async()=>({status:true,data:{...payment(),status}})});
  await processCardLink(reference);expect(state.cards).toHaveLength(0);expect(state.attempt.status).toBe('pending');
  expect(state.attempt.refund_status).toBe('not_requested');
 });
 it.each([['failed','failed'],['needs-attention','manual_review'],['processing','pending']])('shows provider refund %s accurately',async(status,expected)=>{
  state.fetch.mockImplementation(async(url)=>({ok:true,json:async()=>({status:true,data:String(url).includes('/transaction/verify/')?payment():refund(status)})}));
  await processCardLink(reference);expect(state.attempt.refund_status).toBe(expected);expect(state.attempt.refund_status).not.toBe('processed');
 });
 it.each([{amount:1},{currency:'USD'},{domain:'live'},{transaction:999}])('rejects refund response mismatches %j',async patch=>{
  state.fetch.mockImplementation(async(url)=>({ok:true,json:async()=>({status:true,data:String(url).includes('/transaction/verify/')?payment():{...refund('processed'),...patch}})}));
  await processCardLink(reference);expect(state.attempt.refund_status).toBe('manual_review');
 });
 it('recovers Flutterwave linking and refunds while Paystack is active, without duplicate refund POSTs',async()=>{
  Object.assign(state.attempt,{provider:'flutterwave',amount_minor:10000});
  const flw={id:123,tx_ref:reference,amount:100,currency:'NGN',status:'successful',payment_type:'card',created_at:new Date().toISOString(),customer:{email:'user@example.test'},meta:{purpose:'card_link',user_id:userId,request_id:'request'},card:{token:'flw-fixture_token123',last_4digits:'4081',expiry:'12/98',issuer:'Test Bank',type:'visa'}};
  state.fetch.mockImplementation(async(url,options)=>new Response(JSON.stringify({status:'success',data:String(url).includes('/transactions/verify_by_reference')?flw:{id:456,tx_id:123,amount_refunded:100,status:options.method==='POST'?'completed':'completed-mpgs'}})));
  await processCardLink(reference);expect(state.cards).toHaveLength(1);expect(state.attempt.refund_status).toBe('pending');
  expect(openAuthorization(userId,state.cards[0].authorization_ciphertext)).toMatchObject({authorization:{provider:'flutterwave'}});
  await processCardLink(reference);await processCardLink(reference);expect(state.attempt.refund_status).toBe('processed');
  expect(state.fetch.mock.calls.filter(([,o])=>o.method==='POST')).toHaveLength(1);
  expect(state.fetch.mock.calls.every(([url])=>String(url).startsWith('https://api.flutterwave.com/v3/'))).toBe(true);
 });
 it('recovers a lost Flutterwave refund POST by GET only',async()=>{
  Object.assign(state.attempt,{provider:'flutterwave',amount_minor:10000,status:'verified',provider_transaction_id:'123',refund_status:'submitting'});
  state.fetch.mockImplementation(async url=>new Response(JSON.stringify({status:'success',data:String(url).includes('id=123')?[{id:456,tx_id:123,amount_refunded:100,status:'completed-mpgs'}]:[]})));
  await processCardLink(reference);expect(state.attempt.refund_status).toBe('processed');expect(state.fetch.mock.calls.every(([,o])=>o.method==='GET')).toBe(true);
 });
 it('rejects invented, malformed or expired card fields',()=>{
  for(const patch of [{last4:'abcd'},{exp_year:'2000'},{exp_month:'13'},{authorization_code:'not-a-token'}]){
   expect(verifiedCard(state.attempt,{...payment(),authorization:{...payment().authorization,...patch}})).toBeNull();
  }
 });
 it('authenticated encryption binds the stored authorization to its owner',()=>{
  const value=sealAuthorization(userId,{authorization_code:'AUTH_secret'},'user@example.test');
  expect(()=>openAuthorization('other',value)).toThrow();expect(()=>openAuthorization(userId,value.slice(0,-4)+'AAAA')).toThrow();
 });
 it('validates HTTPS checkout origin and webhook bytes',()=>{
  expect(checkoutUrl('https://checkout.paystack.com/safe')).toBe('https://checkout.paystack.com/safe');
  for(const url of ['http://checkout.paystack.com/a','https://checkout.paystack.com.attacker.test/a','https://user@checkout.paystack.com/a'])expect(()=>checkoutUrl(url)).toThrow();
  const raw=Buffer.from('{ "event": "charge.success" }');const signature=createHmac('sha512','sk_test_fixture').update(raw).digest('hex');
  expect(validPaystackSignature(raw,signature)).toBe(true);expect(validPaystackSignature(Buffer.from('{}'),signature)).toBe(false);expect(validPaystackSignature(raw,'bad')).toBe(false);
 });
});
