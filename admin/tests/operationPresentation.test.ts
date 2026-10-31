import {expect,it} from 'vitest';
import {authenticationStatus,operationStatus,operationTrace,type OperationEvent} from '../src/operationPresentation';
const event=(key:string,patch:Partial<OperationEvent>={}):OperationEvent=>({key,source:'backend',operation_id:key,request_id:'terminal-request',operation:'identification',stage:'search',state:'succeeded',occurred_at:'2026-10-31T04:31:23Z',details:{},...patch});
const reader=event('reader',{source:'ccnet',request_id:'reader-request',stage:'reader',details:{providerMatched:true}});
const provider=event('provider',{details:{upstreamRequestId:'reader-request',score:84,providerMatched:true}});
const rejected=event('decision',{stage:'authenticate',state:'rejected',details:{decision:'reject',score:84,errorCode:'low_score'}});
it('successful search is neutral completion, never a payment or authentication approval',()=>{
 expect(operationStatus(reader)).toEqual({label:'Search completed',tone:'observed'});
 expect(operationStatus(provider)).toEqual({label:'Search completed',tone:'observed'});
 expect(authenticationStatus(reader,[reader])).toMatchObject({label:'Decision unavailable',tone:'observed'});
});
it('shows a backend rejection even though the reader and provider search succeeded',()=>{
 const events=[reader,provider,rejected];expect(authenticationStatus(reader,events)).toMatchObject({label:'Palm rejected',tone:'rejected',score:84});expect(authenticationStatus(reader,events).explanation).toContain('below the payment threshold');
 expect(operationTrace(reader,events).map(e=>e.key).sort()).toEqual(['decision','provider','reader']);
});
it('never borrows a later acceptance from another attempt on the same sale',()=>{
 const different=event('later',{request_id:'other-request',stage:'authenticate',details:{decision:'accept',score:99}});
 expect(authenticationStatus(reader,[reader,provider,rejected,different]).label).toBe('Palm rejected');
 expect(operationTrace(reader,[reader,provider,rejected,different])).not.toContain(different);
});
it('keeps accepted authentication separate from confirmed payment',()=>{
 const accepted=event('decision',{stage:'authenticate',details:{decision:'accept',score:91}});
 expect(authenticationStatus(reader,[reader,provider,accepted])).toMatchObject({label:'Palm accepted',tone:'succeeded',score:91});
 expect(authenticationStatus(reader,[reader,provider,accepted]).explanation).toContain('must still tap Pay');
 expect(operationStatus(event('pay',{operation:'payment',stage:'confirm'})).label).toBe('Pay request completed');
 expect(operationStatus(event('settled',{operation:'payment',stage:'payment_status',details:{result:'settled'}})).label).toBe('Payment confirmed');
});
it('reports pending, errors and ambiguous correlation without inventing an approval',()=>{
 expect(authenticationStatus(reader,[reader,provider,event('decision',{stage:'authenticate',state:'started'})]).label).toBe('Decision pending');
 expect(authenticationStatus(reader,[reader,provider,event('decision',{stage:'authenticate',state:'failed',details:{errorCode:'palm_binding_changed'}})]).label).toBe('Authentication error');
 expect(authenticationStatus(reader,[reader,provider,rejected,event('duplicate',{stage:'authenticate',details:{decision:'accept'}})]).label).toBe('Decision unavailable');
});
