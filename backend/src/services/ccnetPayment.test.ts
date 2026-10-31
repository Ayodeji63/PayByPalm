import { beforeEach, expect, it, vi } from 'vitest';
const m=vi.hoisted(()=>({single:vi.fn(),update:vi.fn(),bindings:vi.fn(),identify:vi.fn(),profile:vi.fn(),charge:vi.fn()}));
vi.mock('../config.js',()=>({config:{PALM_PROVIDER:'ccnet',PALM_ACCEPT_SCORE:50,PALM_STEP_UP_SCORE:40,MAX_CANDIDATES:4,AUTH_VALIDITY_SECONDS:60}}));
vi.mock('../db/client.js',()=>({db:{from:()=>({select:vi.fn().mockReturnThis(),eq:vi.fn().mockReturnThis(),is:vi.fn().mockReturnThis(),update:m.update.mockReturnThis(),maybeSingle:m.single})}}));
vi.mock('./ccnetBindings.js',()=>({ccnetBindings:m.bindings,sameBindings:(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b)}));
vi.mock('../palm/index.js',()=>({palm:{identify:m.identify}}));
vi.mock('../db/queries.js',()=>({getProfile:m.profile,maskName:(value:string)=>value}));
vi.mock('./cardPaymentService.js',()=>({chargeCardPayment:m.charge}));
vi.mock('./paystack.js',()=>({requirePaystack:vi.fn(),paystackDomain:()=> 'test'}));
import { authenticateTransaction, confirmTransaction } from './paymentService.js';
const terminal={id:'terminal',merchantId:'merchant',merchantName:'Merchant',label:'Counter'};
const binding={id:'binding',userId:'payer',subjectId:'session',palmSide:'right'};
const pending={id:'transaction',terminal_id:'terminal',amount_minor:1000,status:'pending'};
const log={info:vi.fn()} as any;
beforeEach(()=>{
 vi.clearAllMocks();m.single.mockReset();m.single.mockResolvedValue({data:pending});m.bindings.mockReset();m.bindings.mockResolvedValue([binding]);m.profile.mockResolvedValue({id:'payer',full_name:'Payer',palm_enrolled:true});
 m.identify.mockResolvedValue({candidates:[{...binding,score:50,cosineSimilarity:0.50}],meta:{providerIsMatch:true}});
});
it.each([49,50,51])('accepts only a positive upstream verdict and score >=50: %s',async score=>{
 m.identify.mockResolvedValue({candidates:[{...binding,score,cosineSimilarity:score/100}],meta:{providerIsMatch:true}});
 m.single.mockResolvedValueOnce({data:pending}).mockResolvedValueOnce({data:{id:'card',last4:'1234'}}).mockResolvedValueOnce({data:{...pending,status:'authenticated'}});
 const result=await authenticateTransaction('transaction',terminal,Buffer.from('probe').toString('base64'),undefined,log);
 expect(result.decision).toBe(score>=50?'accept':'reject');expect(m.identify).toHaveBeenCalledOnce();expect(m.charge).not.toHaveBeenCalled();
 if(score>=50)expect(m.update).toHaveBeenCalledWith(expect.objectContaining({palm_provider:'ccnet',palm_binding_id:'binding',match_mode:'search',match_score:score}));
});
it('rejects a negative upstream verdict even with a high score',async()=>{
 m.identify.mockResolvedValue({candidates:[{...binding,score:99}],meta:{providerIsMatch:false}});
 expect((await authenticateTransaction('transaction',terminal,'cHJvYmU=',undefined,log)).decision).toBe('reject');expect(m.update).not.toHaveBeenCalled();
});
it('rejects when a second eligible user also reaches 50',async()=>{
 m.identify.mockResolvedValue({candidates:[{...binding,score:95},{...binding,id:'other-binding',userId:'other',score:50}],meta:{providerIsMatch:true}});
 expect(await authenticateTransaction('transaction',terminal,'cHJvYmU=',undefined,log)).toMatchObject({decision:'reject',reason:'ambiguous_match'});expect(m.update).not.toHaveBeenCalled();
});
it.each([{current:[]},{current:[{...binding,id:'replacement'}]}])('rejects revocation or replacement during matching',async ({current})=>{
 m.bindings.mockResolvedValueOnce([binding]).mockResolvedValueOnce(current);
 await expect(authenticateTransaction('transaction',terminal,'cHJvYmU=',undefined,log)).rejects.toMatchObject({code:'palm_binding_changed'});expect(m.update).not.toHaveBeenCalled();expect(m.charge).not.toHaveBeenCalled();
});
it('does not send an unrestricted gallery request when no active CCNet bindings exist',async()=>{
 m.bindings.mockResolvedValue([]);expect(await authenticateTransaction('transaction',terminal,'cHJvYmU=',undefined,log)).toMatchObject({decision:'reject',reason:'no_candidates'});expect(m.identify).not.toHaveBeenCalled();
});
it('blocks historical Tencent authentication from a new CCNet charge',async()=>{
 m.single.mockResolvedValue({data:{...pending,status:'authenticated',matched_user_id:'payer',match_score:99,palm_provider:'tencent',authenticated_at:new Date().toISOString()}});
 await expect(confirmTransaction('transaction',terminal)).rejects.toMatchObject({code:'palm_binding_changed'});expect(m.charge).not.toHaveBeenCalled();
});
it('continues recovery of an existing processing payment regardless of its old provider',async()=>{
 m.single.mockResolvedValueOnce({data:{...pending,status:'processing',palm_provider:'tencent'}}).mockResolvedValueOnce({data:{...pending,status:'settled',settled_at:new Date().toISOString()}});
 expect(await confirmTransaction('transaction',terminal)).toMatchObject({transactionId:'transaction'});expect(m.charge).toHaveBeenCalledOnce();
});

it('accepts the posted 0.8471 result when it is the only eligible match above the new threshold',async()=>{
 m.identify.mockResolvedValue({candidates:[{...binding,score:84,cosineSimilarity:0.8471496105194092}],meta:{providerIsMatch:true}});
 m.single.mockResolvedValueOnce({data:pending}).mockResolvedValueOnce({data:{id:'card',last4:'1234'}}).mockResolvedValueOnce({data:{...pending,status:'authenticated'}});
 expect(await authenticateTransaction('transaction',terminal,'cHJvYmU=',undefined,log)).toMatchObject({decision:'accept',score:84});expect(m.charge).not.toHaveBeenCalled();
});

it('keeps the posted two-user result ambiguous when both scores reach 50',async()=>{
 m.identify.mockResolvedValue({candidates:[{...binding,score:84},{...binding,id:'second',userId:'other',score:63}],meta:{providerIsMatch:true}});
 expect(await authenticateTransaction('transaction',terminal,'cHJvYmU=',undefined,log)).toMatchObject({decision:'reject',score:84,reason:'ambiguous_match'});expect(m.update).not.toHaveBeenCalled();expect(m.charge).not.toHaveBeenCalled();
});
