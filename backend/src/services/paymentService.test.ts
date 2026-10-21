import {beforeEach,describe,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({single:vi.fn(),eq:vi.fn(),update:vi.fn(),rpc:vi.fn(),charge:vi.fn(),search:vi.fn(),profile:vi.fn(),compare:vi.fn(),candidates:vi.fn(),consume:vi.fn(),compareCapture:vi.fn(),issue:vi.fn(),ready:vi.fn(),settings:{PALM_PROVIDER:"mock",PAYSTACK_MODE:"test",TENCENT_CAPTURE_MODE:"legacy",TENCENT_H5_IMAGE_ONLY_APPROVED:false,PALM_ACCEPT_SCORE:85,PALM_STEP_UP_SCORE:70,MAX_CANDIDATES:4,AUTH_VALIDITY_SECONDS:60}}));
vi.mock('../config.js',()=>({config:m.settings}));
vi.mock('../db/client.js',()=>({db:{from:()=>({select:vi.fn().mockReturnThis(),eq:m.eq.mockReturnThis(),is:vi.fn().mockReturnThis(),update:m.update.mockReturnThis(),maybeSingle:m.single}),rpc:m.rpc}}));
vi.mock('./cardPaymentService.js',()=>({chargeCardPayment:m.charge}));
vi.mock('./paystack.js',()=>({requirePaystack:m.ready,paystackDomain:()=>m.settings.PAYSTACK_MODE}));
vi.mock('../db/queries.js',()=>({getCandidatesByLast4:vi.fn(),getProfile:m.profile,maskName:(n:string)=>n}));
vi.mock('../palm/index.js',()=>({palm:{search:m.search,compare:m.compare,compareCapture:m.compareCapture}}));
vi.mock('./palmCaptureService.js',()=>({getActivePalmCandidates:m.candidates,consumePalmCapture:m.consume,issuePalmCapture:m.issue}));
vi.mock('../lib/image.js',()=>({normaliseImage:(data:string)=>({data})}));
import {authenticateTransaction,authenticateSdkTransaction,beginPaymentCapture,matchPalmCandidates,confirmTransaction,cancelTransaction,createTransaction} from './paymentService.js';
import {PalmProviderError} from '../errors.js';
const terminal={id:'terminal',merchantId:'merchant',merchantName:'Merchant',label:'Counter'};
const profile={id:'payer',full_name:'Payer',pin_hash:null,palm_enrolled:true};
const pending={id:'txn',terminal_id:'terminal',amount_minor:100,status:'pending'};
const auth={...pending,status:'authenticated',matched_user_id:'payer',match_score:92,authenticated_at:new Date().toISOString()};
const settled={...auth,status:'settled',settled_at:new Date().toISOString()};
const log={info:vi.fn(),warn:vi.fn()} as any;
beforeEach(()=>{vi.clearAllMocks();m.ready.mockReset();m.settings.PALM_PROVIDER="mock";m.settings.PAYSTACK_MODE="test";m.settings.TENCENT_CAPTURE_MODE="legacy";m.settings.TENCENT_H5_IMAGE_ONLY_APPROVED=false;m.single.mockReset();m.profile.mockResolvedValue(profile);m.search.mockResolvedValue({userId:'payer',score:92});m.compare.mockResolvedValue({isMatch:true,score:92});m.candidates.mockResolvedValue([{id:'binding',user_id:'payer',tencent_palm_id:'palm-id'}]);m.consume.mockResolvedValue({userId:'payer',capture:{}});m.compareCapture.mockResolvedValue({isMatch:true,score:92});m.charge.mockResolvedValue(undefined);});
describe('direct card payment policy',()=>{
 it.each(['legacy','h5'].flatMap(mode=>[2080017,2080010].map(providerCode=>({mode,providerCode}))))('checks the next enrolled user after candidate miss $providerCode without charging during $mode authentication',async ({mode,providerCode})=>{
  m.settings.PALM_PROVIDER='tencent';m.settings.TENCENT_CAPTURE_MODE=mode;
  m.candidates.mockResolvedValue([{id:'opposite-binding',user_id:'other-payer',tencent_palm_id:'other-palm'},{id:'binding',user_id:'payer',tencent_palm_id:'palm-id'}]);
  m.consume.mockResolvedValue({userId:'payer',capture:{}});
  const compare=mode==='h5'?m.compareCapture:m.compare;
  compare.mockRejectedValueOnce(new PalmProviderError('candidate did not match',{providerCode,httpStatus:200})).mockResolvedValueOnce({isMatch:true,score:95});
  m.single.mockResolvedValueOnce({data:pending}).mockResolvedValueOnce({data:{id:'card',last4:'4081'}}).mockResolvedValueOnce({data:auth});
  const outcome=mode==='h5'?await authenticateSdkTransaction('txn',terminal,{captureId:'capture',payload:'opaque'},log):await authenticateTransaction('txn',terminal,'image',undefined,log);
  expect(outcome).toMatchObject({decision:'accept',cardLast4:'4081'});
  expect(compare.mock.calls.map(([user])=>user)).toEqual(['other-payer','payer']);
  expect(m.update).toHaveBeenCalledWith(expect.objectContaining({matched_user_id:'payer'}));expect(m.charge).not.toHaveBeenCalled();expect(m.search).not.toHaveBeenCalled();
 });
 it('checks payment setup before persisting authorization or offering card confirmation',async()=>{
  m.single.mockResolvedValue({data:pending});m.ready.mockImplementation(()=>{throw Object.assign(new Error('missing payment configuration'),{code:'card_payment_not_configured',status:503});});
  await expect(authenticateTransaction('txn',terminal,'image',undefined,log)).rejects.toMatchObject({code:'card_payment_not_configured',status:503});
  expect(m.ready).toHaveBeenCalledWith('payment');expect(m.update).not.toHaveBeenCalled();expect(m.charge).not.toHaveBeenCalled();
 });
 it('defaults Tencent terminals to the original camera without issuing an SDK token',async()=>{m.settings.PALM_PROVIDER='tencent';m.single.mockResolvedValue({data:pending});expect(await beginPaymentCapture('txn',terminal)).toEqual({captureMode:'legacy'});expect(m.issue).not.toHaveBeenCalled();});
 it('retains H5 as an explicit opt-in',async()=>{m.settings.PALM_PROVIDER='tencent';m.settings.TENCENT_CAPTURE_MODE='h5';m.single.mockResolvedValue({data:pending});m.issue.mockResolvedValue({captureMode:'h5',captureId:'capture'});expect(await beginPaymentCapture('txn',terminal)).toMatchObject({captureMode:'h5',captureId:'capture',candidateCount:1});expect(m.issue).toHaveBeenCalledOnce();});
 it('does not accept stale H5 captures while the original camera is selected',async()=>{m.single.mockResolvedValue({data:pending});await expect(authenticateSdkTransaction('txn',terminal,{captureId:'capture',payload:'opaque'},log)).rejects.toMatchObject({code:'palm_capture_mode_changed'});expect(m.consume).not.toHaveBeenCalled();});
 it.each([{payer:'payer',amount:5000},{payer:'another-payer',amount:15000}])('allows live original-camera payments without a pilot allowlist or extra cap: %j',async({payer,amount})=>{
  m.settings.PALM_PROVIDER='tencent';m.settings.PAYSTACK_MODE='live';
  const sale={...pending,amount_minor:amount}, accepted={...auth,amount_minor:amount,matched_user_id:payer};
  m.profile.mockResolvedValue({...profile,id:payer});m.candidates.mockResolvedValue([{id:'binding',user_id:payer,tencent_palm_id:'palm-id'}]);
  m.single.mockResolvedValueOnce({data:sale}).mockResolvedValueOnce({data:{id:'card',last4:'1234',brand:'visa'}}).mockResolvedValueOnce({data:accepted});
  expect(await authenticateTransaction('txn',terminal,'image',undefined,log)).toMatchObject({decision:'accept',mode:'compare',cardLast4:'1234',pinRequired:false});
  expect(m.compare).toHaveBeenCalledWith(payer,'image');expect(m.search).not.toHaveBeenCalled();expect(m.charge).not.toHaveBeenCalled();
  m.single.mockResolvedValueOnce({data:accepted}).mockResolvedValueOnce({data:{...settled,amount_minor:amount,matched_user_id:payer}});
  expect(await confirmTransaction('txn',terminal)).toMatchObject({transactionId:'txn',amountMinor:amount});expect(m.charge).toHaveBeenCalledWith('txn','terminal');
 });
 it('rejects binding changes during the original-camera comparison sweep',async()=>{m.single.mockResolvedValue({data:pending});m.candidates.mockResolvedValueOnce([{id:'binding',user_id:'payer',tencent_palm_id:'old'}]).mockResolvedValueOnce([{id:'binding',user_id:'payer',tencent_palm_id:'new'}]);await expect(authenticateTransaction('txn',terminal,'image',undefined,log)).rejects.toMatchObject({code:'palm_binding_changed'});expect(m.update).not.toHaveBeenCalled();});
 it('blocks unapproved image-only integration before live card authorization',async()=>{m.settings.PALM_PROVIDER='tencent';m.settings.PAYSTACK_MODE='live';m.settings.TENCENT_CAPTURE_MODE='h5';m.single.mockResolvedValue({data:pending});await expect(beginPaymentCapture('txn',terminal)).rejects.toMatchObject({code:'palm_liveness_confirmation_required'});await expect(authenticateSdkTransaction('txn',terminal,{captureId:'capture',payload:'opaque'},log)).rejects.toMatchObject({code:'palm_liveness_confirmation_required'});expect(m.consume).not.toHaveBeenCalled();expect(m.compareCapture).not.toHaveBeenCalled();});
 it('cannot bypass the SDK capture using the legacy raw-image route',async()=>{m.settings.PALM_PROVIDER='tencent';m.settings.TENCENT_CAPTURE_MODE='h5';m.single.mockResolvedValue({data:pending});await expect(authenticateTransaction('txn',terminal,'image',undefined,log)).rejects.toMatchObject({code:'palm_sdk_required'});expect(m.compare).not.toHaveBeenCalled();});
 it('uses Tencent 1:1 across active bindings and never native search',async()=>{m.settings.PALM_PROVIDER='tencent';m.single.mockResolvedValueOnce({data:pending}).mockResolvedValueOnce({data:{id:'card'}}).mockResolvedValueOnce({data:auth});await authenticateTransaction('txn',terminal,'image',undefined,log);expect(m.compare).toHaveBeenCalledWith('payer','image');expect(m.search).not.toHaveBeenCalled();});
 it('verifies SDK capture before comparing and binds the displayed card',async()=>{m.settings.TENCENT_CAPTURE_MODE='h5';m.single.mockResolvedValueOnce({data:pending}).mockResolvedValueOnce({data:{id:'card',last4:'4081'}}).mockResolvedValueOnce({data:auth});expect(await authenticateSdkTransaction('txn',terminal,{captureId:'capture',payload:'opaque'},log)).toMatchObject({decision:'accept',mode:'compare',cardLast4:'4081'});expect(m.consume).toHaveBeenCalledWith('terminal','txn','payment',{captureId:'capture',payload:'opaque'});expect(m.compareCapture).toHaveBeenCalledWith('payer',{});expect(m.search).not.toHaveBeenCalled();});
 it('does not accept a match if active bindings changed during comparison',async()=>{m.settings.TENCENT_CAPTURE_MODE='h5';m.single.mockResolvedValueOnce({data:pending});m.candidates.mockResolvedValueOnce([{id:'binding',user_id:'payer',tencent_palm_id:'palm-id'}]).mockResolvedValueOnce([]);await expect(authenticateSdkTransaction('txn',terminal,{captureId:'capture',payload:'opaque'},log)).rejects.toMatchObject({code:'palm_binding_changed'});expect(m.update).not.toHaveBeenCalled();});
 it('reports missing sale schema as an actionable configuration error',async()=>{for(const code of ['PGRST202','42703','42883']){m.rpc.mockResolvedValue({data:null,error:{code}});await expect(createTransaction(terminal,100,undefined,'sale')).rejects.toMatchObject({status:503,code:'payment_setup_required'});}});
 it('keeps stable sale identity',async()=>{m.rpc.mockResolvedValue({data:pending,error:null});await createTransaction(terminal,100,'Lunch','sale');expect(m.rpc).toHaveBeenCalledWith('create_terminal_transaction',{p_terminal_id:'terminal',p_sale_id:'sale',p_amount:100,p_description:'Lunch'});});
 it('authenticates without an internal balance and binds the displayed card',async()=>{m.single.mockResolvedValueOnce({data:pending}).mockResolvedValueOnce({data:{id:'card',last4:'4081',brand:'visa'}}).mockResolvedValueOnce({data:auth});expect(await authenticateTransaction('txn',terminal,'image',undefined,log)).toMatchObject({decision:'accept',cardLast4:'4081',pinRequired:false});expect(m.update).toHaveBeenCalledWith(expect.objectContaining({payment_card_id:'card'}));expect(m.rpc).not.toHaveBeenCalled();});
 it('rejects a stale provider match after palm removal',async()=>{m.profile.mockResolvedValue({...profile,palm_enrolled:false});m.single.mockResolvedValue({data:pending});expect(await authenticateTransaction('txn',terminal,'image',undefined,log)).toMatchObject({decision:'reject'});expect(m.update).not.toHaveBeenCalled();});
 it('requires another scan for a marginal match',async()=>{m.compare.mockResolvedValue({isMatch:true,score:78});m.single.mockResolvedValue({data:pending});expect(await authenticateTransaction('txn',terminal,'image',undefined,log)).toMatchObject({decision:'reject',reason:'strong_match_required'});expect(m.update).not.toHaveBeenCalled();});
 it('rejects missing or paused default card',async()=>{m.single.mockResolvedValueOnce({data:pending}).mockResolvedValueOnce({data:null});expect(await authenticateTransaction('txn',terminal,'image',undefined,log)).toMatchObject({decision:'reject',reason:'no_active_card'});expect(m.update).not.toHaveBeenCalled();});
 it('does not return a match after losing the update race',async()=>{m.single.mockResolvedValueOnce({data:pending}).mockResolvedValueOnce({data:{id:'card'}}).mockResolvedValueOnce({data:null});await expect(authenticateTransaction('txn',terminal,'image',undefined,log)).rejects.toMatchObject({code:'invalid_transaction_state'});});
 it('rejects an expired palm before charging',async()=>{m.single.mockResolvedValue({data:{...auth,authenticated_at:'2000-01-01'}});await expect(confirmTransaction('txn',terminal)).rejects.toMatchObject({code:'stale_authentication'});expect(m.charge).not.toHaveBeenCalled();});
 it('rejects marginal scores instead of accepting a PIN',async()=>{m.single.mockResolvedValue({data:{...auth,match_score:78}});await expect(confirmTransaction('txn',terminal)).rejects.toMatchObject({code:'payment_match_rejected'});expect(m.charge).not.toHaveBeenCalled();});
 it('charges a card and returns only a verified receipt',async()=>{m.single.mockResolvedValueOnce({data:auth}).mockResolvedValueOnce({data:settled});expect(await confirmTransaction('txn',terminal)).toMatchObject({transactionId:'txn',settledAt:settled.settled_at});expect(m.charge).toHaveBeenCalledWith('txn','terminal');expect(m.rpc).not.toHaveBeenCalled();});
 it('does not charge an already settled sale',async()=>{m.single.mockResolvedValue({data:settled});await confirmTransaction('txn',terminal);expect(m.charge).not.toHaveBeenCalled();});
 it('preserves a pending charge without returning success',async()=>{m.single.mockResolvedValueOnce({data:auth}).mockResolvedValueOnce({data:{...auth,status:'processing'}});await expect(confirmTransaction('txn',terminal)).rejects.toMatchObject({code:'card_payment_pending'});});
 it('reconciles after palm expiry without creating another sale',async()=>{m.single.mockResolvedValueOnce({data:{...auth,status:'processing',authenticated_at:'2000-01-01'}}).mockResolvedValueOnce({data:settled});await confirmTransaction('txn',terminal);expect(m.charge).toHaveBeenCalledTimes(1);});
 it('cannot cancel an in-flight card payment',async()=>{m.single.mockResolvedValue({data:{...auth,status:'processing'}});await expect(cancelTransaction('txn',terminal)).rejects.toMatchObject({code:'card_payment_pending'});expect(m.update).not.toHaveBeenCalled();});
 it('rejects another terminal before charging',async()=>{m.single.mockResolvedValue({data:{...auth,terminal_id:'other'}});await expect(confirmTransaction('txn',terminal)).rejects.toMatchObject({status:404});expect(m.charge).not.toHaveBeenCalled();});
});

describe('complete 1:1 candidate sweep',()=>{
 const candidates=Array.from({length:12},(_,i)=>({id:`binding-${i}`,user_id:`user-${i}`,tencent_palm_id:`palm-${i}`}));
 it.each([1001013,2080010])('continues past provider no-match %s with the genuine payer at any position',async providerCode=>{
  for(const matchIndex of [0,1,11]){
   const compare=vi.fn(async(userId:string)=>{
    if(userId===`user-${matchIndex}`)return {isMatch:true,score:95};
    throw new PalmProviderError('user not found in search',{providerCode,httpStatus:200});
   });
   expect(await matchPalmCandidates(candidates,compare)).toMatchObject({userId:`user-${matchIndex}`,outcome:{decision:'accept'}});
   expect(compare.mock.calls.map(([userId])=>userId)).toEqual(candidates.map(c=>c.user_id));
  }
 });
 it('returns a completed no-match rather than an exception when every candidate returns 2080010',async()=>{
  const compare=vi.fn().mockRejectedValue(new PalmProviderError('user not found in search',{providerCode:2080010,httpStatus:400}));
  expect(await matchPalmCandidates(candidates,compare)).toMatchObject({userId:null,outcome:{decision:'reject',reason:'no_match'}});
  expect(compare).toHaveBeenCalledTimes(12);
 });
 it('does not mistake a no-match envelope for a successful match or hide ambiguous payers',async()=>{
  const compare=vi.fn().mockResolvedValueOnce({isMatch:true,score:95}).mockRejectedValueOnce(new PalmProviderError('user not found in search',{providerCode:2080010,httpStatus:200})).mockResolvedValue({isMatch:true,score:96});
  expect(await matchPalmCandidates(candidates,compare)).toMatchObject({userId:null,outcome:{decision:'reject',reason:'ambiguous_match'}});
  expect(compare).toHaveBeenCalledTimes(12);
 });
 it.each([401,403,429,500,502,503])('keeps no-match codes fatal on provider HTTP %s',async httpStatus=>{
  const failure=new PalmProviderError('provider failed',{providerCode:2080010,httpStatus});
  const compare=vi.fn().mockResolvedValueOnce({isMatch:true,score:95}).mockRejectedValueOnce(failure);
  await expect(matchPalmCandidates(candidates,compare)).rejects.toBe(failure);
 });
 it.each([1001025,2080017])('continues after direction code %s before and after a unique positive match',async code=>{
  for(const index of [0,1]){
   const compare=vi.fn(async(user:string)=>{
    if(user===`user-${index}`)return {isMatch:true,score:95};
    throw new PalmProviderError('hand absent',{providerCode:code,httpStatus:400});
   });
   expect(await matchPalmCandidates(candidates,compare)).toMatchObject({userId:`user-${index}`,outcome:{decision:'accept'}});expect(compare).toHaveBeenCalledTimes(12);
  }
 });
 it('rejects when none of the enrolled accounts has the scanned hand',async()=>{
  const compare=vi.fn().mockRejectedValue(new PalmProviderError('hand absent',{providerCode:2080017}));
  expect(await matchPalmCandidates(candidates,compare)).toMatchObject({userId:null,outcome:{decision:'reject',reason:'no_match'}});expect(compare).toHaveBeenCalledTimes(12);
 });
 it('still rejects ambiguity when another candidate has no registration for this hand',async()=>{
  const compare=vi.fn().mockRejectedValueOnce(new PalmProviderError('hand absent',{providerCode:2080017})).mockResolvedValue({isMatch:true,score:95});
  expect(await matchPalmCandidates(candidates,compare)).toMatchObject({userId:null,outcome:{reason:'ambiguous_match'}});expect(compare).toHaveBeenCalledTimes(12);
 });
 it.each([999,2080023,2080003,2080004,2080006,2080016,1001023,1001024])('keeps provider failure %s fatal even after finding a match',async providerCode=>{
  const failure=new PalmProviderError('provider failed',{providerCode});
  const compare=vi.fn().mockResolvedValueOnce({isMatch:true,score:95}).mockRejectedValueOnce(failure);
  await expect(matchPalmCandidates(candidates,compare)).rejects.toBe(failure);
 });
 it.each([401,403,429,500,502,503])('does not suppress missing-hand codes returned with HTTP %s',async httpStatus=>{
  const failure=new PalmProviderError('unavailable',{providerCode:2080017,httpStatus});
  await expect(matchPalmCandidates(candidates,vi.fn().mockRejectedValue(failure))).rejects.toBe(failure);
 });
 it.each([2080017,2080010])('does not suppress unrelated errors carrying lookalike code %s',async providerCode=>{
  const failure=Object.assign(new Error('unrelated'),{providerCode});
  await expect(matchPalmCandidates(candidates,vi.fn().mockRejectedValue(failure))).rejects.toBe(failure);
 });
 it.each([null,undefined])('rejects an empty comparison after a positive match: %j',async value=>{
  const compare=vi.fn().mockResolvedValueOnce({isMatch:true,score:95}).mockResolvedValueOnce(value);
  await expect(matchPalmCandidates(candidates,compare)).rejects.toMatchObject({code:'palm_comparison_invalid'});
 });
 it.each([2080017,2080010])('enforces the sweep deadline even when candidate miss %s arrives late',async providerCode=>{
  const clock=vi.spyOn(Date,'now').mockReturnValue(0);
  try{
   const compare=vi.fn(async()=>{clock.mockReturnValue(45001);throw new PalmProviderError('candidate miss',{providerCode});});
   await expect(matchPalmCandidates(candidates,compare)).rejects.toMatchObject({code:'palm_comparison_incomplete'});expect(compare).toHaveBeenCalledTimes(1);
  }finally{clock.mockRestore();}
 });
 it('compares every enrolled candidate, including beyond ten',async()=>{const compare=vi.fn(async(userId:string)=>({isMatch:userId==='user-11',score:userId==='user-11'?95:10}));expect(await matchPalmCandidates(candidates,compare)).toMatchObject({userId:'user-11',outcome:{decision:'accept'}});expect(compare).toHaveBeenCalledTimes(12);});
 it('does not accept the highest score when Tencent says not matched',async()=>{expect(await matchPalmCandidates(candidates,async()=>({isMatch:false,score:99}))).toMatchObject({userId:null,outcome:{decision:'reject'}});});
 it('rejects multiple provider matches instead of choosing the first or highest',async()=>{expect(await matchPalmCandidates(candidates,async()=>({isMatch:true,score:95}))).toMatchObject({userId:null,outcome:{reason:'ambiguous_match'}});});
 it('fails closed if a provider fails after a positive match',async()=>{const compare=vi.fn().mockResolvedValueOnce({isMatch:true,score:95}).mockRejectedValueOnce(new Error('provider offline'));await expect(matchPalmCandidates(candidates,compare)).rejects.toThrow('provider offline');});
 it('rejects malformed scores',async()=>{await expect(matchPalmCandidates(candidates,async()=>({isMatch:true,score:NaN}))).rejects.toMatchObject({code:'palm_comparison_invalid'});});
 it('does not compare an empty pool',async()=>{const compare=vi.fn();expect(await matchPalmCandidates([],compare)).toMatchObject({userId:null,outcome:{reason:'no_candidates'}});expect(compare).not.toHaveBeenCalled();});
});
