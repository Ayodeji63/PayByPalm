import { beforeEach,expect,it,vi } from 'vitest';
vi.mock('../db/client.js',()=>({db:{}}));
vi.mock('../logger.js',()=>({logger:{warn:vi.fn()}}));
import {operations,createOperationRecorder,operationContext,safeOperationDetails,observeOperationRequest} from './operationEvents.js';
import {EventEmitter} from 'node:events';
const requestId='11111111-1111-4111-8111-111111111111',terminalId='22222222-2222-4222-8222-222222222222';
it('records ordered spans with authenticated context and strips secret fields',async()=>{
 const batches:any[]=[];const recorder=createOperationRecorder(async batch=>{batches.push(batch);});
 operationContext.run({requestId,terminalId},()=>{recorder.emit('enrollment','register','started',{sampleCount:3,imagesB64:['secret'],Authorization:'secret'});recorder.emit('identification','search','succeeded',{score:85,cosineSimilarity:.859,upstreamRequestId:requestId,timings:{embed_ms:120,secret:1}});});
 await recorder.flush();expect(batches.flat()).toHaveLength(2);expect(batches[0][0]).toMatchObject({request_id:requestId,terminal_id:terminalId,details:{sampleCount:3}});expect(JSON.stringify(batches)).not.toContain('secret');expect(batches[0][1].details).toMatchObject({score:85,timings:{embed_ms:120},upstreamRequestId:requestId});
});
it('bounds buffering and does not reject an operation if metadata storage fails',async()=>{
 let release!:()=>void;const persist=vi.fn(()=>new Promise<void>(resolve=>{release=resolve;}));const recorder=createOperationRecorder(persist);
 recorder.emit('capture','frame_captured','observed');const flushing=recorder.flush();for(let i=0;i<1100;i++)recorder.emit('capture','frame_captured','observed');await recorder.flush();expect(persist).toHaveBeenCalledTimes(1);release();await flushing;
 const failed=createOperationRecorder(async()=>{throw new Error('private db failure');});failed.emit('terminal','connected','succeeded');await expect(failed.flush()).resolves.toBeUndefined();
});
it('allows only finite values, bounded error codes, approved enums and timings',()=>{
 expect(safeOperationDetails({score:NaN,cosineSimilarity:Infinity,errorCode:'Authorization secret',guidance:'ready',provider:'ccnet',palmSide:'bad',timings:{embed_ms:-1,search_ms:2,Authorization:'secret'}})).toEqual({guidance:'ready',provider:'ccnet',timings:{search_ms:2}});
});
it('disabled test recording never touches persistence',async()=>{const persist=vi.fn();const recorder=createOperationRecorder(persist,false);recorder.emit('payment','confirm','succeeded');await recorder.flush();expect(persist).not.toHaveBeenCalled();});

it('records the terminal rejection and its reason even when the HTTP request completed normally',()=>{
 const {emit}=operations;const recorded:any[]=[];operations.emit=((...args:any[])=>recorded.push(args)) as typeof emit;
 try{
  const response=new EventEmitter() as any;response.statusCode=200;response.json=()=>response;
  operationContext.run({requestId,terminalId},()=>observeOperationRequest({id:requestId,path:`/transactions/${terminalId}/authenticate`,method:'POST'} as any,response));
  response.json({decision:'reject',score:84,reason:'low_score',imagesB64:['never-record']});response.emit('finish');response.emit('close');
  expect(recorded).toHaveLength(2);expect(recorded[1].slice(0,3)).toEqual(['identification','authenticate','rejected']);expect(recorded[1][3]).toMatchObject({score:84,decision:'reject',errorCode:'low_score'});expect(JSON.stringify(recorded)).not.toContain('never-record');
 }finally{operations.emit=emit;}
});
