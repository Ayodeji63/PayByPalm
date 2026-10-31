import {expect,it} from 'vitest';
import {importantOperations,operationPage,operationStatus,scopeTrace,type OperationEvent} from '../src/operationPresentation';
const e=(key:string,patch:Partial<OperationEvent>={}):OperationEvent=>({key,source:'backend',operation_id:key,request_id:'auth-request',scope_id:'sale',operation:'identification',stage:'authenticate',state:'succeeded',occurred_at:`2026-10-31T06:00:${key.replace(/\D/g,'').slice(-2).padStart(2,'0')}Z`,details:{decision:'accept'},...patch});
it('shows completed captures, final match and cancellation instead of every progress step',()=>{
 const all=[e('1',{operation:'capture',stage:'guidance',state:'observed',details:{}}),e('2',{operation:'capture',stage:'frame_captured',state:'observed',details:{frameCount:1}}),e('3',{operation:'capture',stage:'frame_captured',state:'observed',details:{frameCount:2}}),e('4',{operation:'capture',stage:'frame_captured',state:'observed',details:{frameCount:3}}),e('5',{source:'ccnet',operation_id:'reader',request_id:'reader-request',stage:'reader',state:'started',details:{}}),e('6',{source:'ccnet',operation_id:'reader',request_id:'reader-request',stage:'reader',details:{}}),e('7',{stage:'search',details:{upstreamRequestId:'reader-request'}}),e('8',{operation_id:'auth',state:'started',details:{}}),e('9',{operation_id:'auth',details:{decision:'accept',score:74}}),e('10',{operation:'payment',operation_id:'cancel',request_id:'cancel-request',stage:'cancel',state:'started',details:{}}),e('11',{operation:'payment',operation_id:'cancel',request_id:'cancel-request',stage:'cancel',details:{result:'cancelled'}})];
 const important=importantOperations(all);expect(important.map(event=>event.key)).toEqual(['11','9','4']);expect(operationStatus(important[0]!)).toEqual({label:'Cancelled',tone:'observed'});expect(important.some(event=>operationStatus(event).tone==='succeeded')).toBe(false);
 expect(scopeTrace(all[3]!,all)).toHaveLength(all.length);
});
it('retains standalone reader results and collapses a completed enrollment into one outcome',()=>{
 const reader=e('1',{source:'ccnet',operation:'verification',request_id:'standalone',stage:'reader'});
 const events=[reader,e('2',{operation:'enrollment',stage:'session_claim'}),e('3',{operation:'enrollment',stage:'register'}),e('4',{operation:'enrollment',stage:'sample_submit',details:{result:'completed'}})];
 expect(importantOperations(events).map(event=>event.key)).toEqual(['4','1']);
});
it('only a confirmed settled payment gets the success presentation',()=>{
 for(const event of [e('1'),e('2',{operation:'enrollment',stage:'register'}),e('3',{operation:'payment',stage:'cancel',details:{result:'cancelled'}}),e('4',{operation:'payment',stage:'confirm',details:{}}),e('5',{operation:'payment',stage:'confirm',state:'rejected',details:{errorCode:'card_payment_pending'}})])expect(operationStatus(event).tone).not.toBe('succeeded');
 const settled=e('6',{operation:'payment',stage:'payment_status',details:{result:'settled'}});expect(operationStatus(settled)).toEqual({label:'Payment confirmed',tone:'succeeded'});
 const cancellation=e('7',{operation:'payment',stage:'cancel',state:'rejected',details:{errorCode:'already_settled'}});expect(importantOperations([settled,cancellation])[0]).toBe(settled);
});
it('keeps independent completed capture bursts and paginates ten important events at a time',()=>{
 const events=Array.from({length:23},(_,index)=>e(String(index+1),{operation:'capture',stage:'frame_captured',details:{frameCount:3},state:'observed'}));
 const important=importantOperations(events);expect(important).toHaveLength(23);expect(operationPage(important,1)).toMatchObject({page:1,pages:3,start:1,end:10,total:23});expect(operationPage(important,1).events).toHaveLength(10);expect(operationPage(important,2).events).toHaveLength(10);expect(operationPage(important,3).events).toHaveLength(3);expect(operationPage(important,99).page).toBe(3);expect(operationPage([],2)).toMatchObject({page:1,pages:1,start:0,end:0});
});
