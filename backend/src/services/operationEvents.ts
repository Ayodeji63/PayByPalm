/** Live operational metadata only. Capture bytes and credentials never enter this queue. */
import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import type { Request, Response } from 'express';
import { db } from '../db/client.js';
import { logger } from '../logger.js';

type Kind = 'terminal'|'enrollment'|'verification'|'identification'|'payment'|'capture';
type State = 'started'|'succeeded'|'rejected'|'failed'|'observed';
export interface OperationContext { requestId: string; terminalId?: string; merchantId?: string; userId?: string; scopeId?: string }
export const operationContext = new AsyncLocalStorage<OperationContext>();
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const numeric = new Set(['score','cosineSimilarity','minimumPairSimilarity','sampleCount','frameCount','candidateCount','amountMinor','durationMs']);
const enums: Record<string, readonly string[]> = {
 provider:['ccnet','tencent','mock'], palmSide:['left','right'], decision:['accept','step_up','reject'],
 guidance:['loading','place','position','open','moving','ready','error'], scope:['enrollment','payment'],
 result:['manual_review','pending','claimed','captured','completed','expired','authenticated','processing','settled','failed','cancelled'],
};
export function safeOperationDetails(input: Record<string, unknown>): Record<string, unknown> {
 const output: Record<string, unknown> = {};
 for (const [key,value] of Object.entries(input)) {
  if (numeric.has(key) && typeof value === 'number' && Number.isFinite(value)) output[key] = value;
  else if (key === 'providerMatched' && typeof value === 'boolean') output[key] = value;
  else if (enums[key] && typeof value === 'string' && enums[key]!.includes(value)) output[key] = value;
  else if (key === 'upstreamRequestId' && typeof value === 'string' && uuid.test(value)) output[key]=value;
  else if (key === 'errorCode' && typeof value === 'string' && /^[a-z_]{1,64}$/.test(value)) output[key] = value;
  else if (key === 'timings' && value && typeof value === 'object') {
   const timings: Record<string,number> = {};
   for (const [name,time] of Object.entries(value)) if (['extract_ms','embed_ms','search_ms','transport_ms'].includes(name) && typeof time === 'number' && Number.isFinite(time) && time>=0) timings[name]=time;
   output.timings=timings;
  }
 }
 return output;
}
interface Event {
 operation_id: string; request_id: string; terminal_id: string|null; merchant_id: string|null; user_id: string|null; scope_id: string|null;
 operation: Kind; stage: string; state: State; occurred_at: string; details: Record<string,unknown>;
}
export function createOperationRecorder(persist: (batch: Event[])=>Promise<void>, enabled = true) {
 const queue: Event[]=[]; let timer: ReturnType<typeof setTimeout>|undefined; let flushing=false;
 async function flush() {
  if (flushing || !queue.length) return;
  flushing=true; const batch=queue.splice(0,50);
  try { await persist(batch); }
  catch { logger.warn('Live operation metadata could not be saved; check migration 0028 and database availability'); }
  finally { flushing=false; if(queue.length) schedule(); }
 }
 function schedule() { if(timer) return; timer=setTimeout(()=>{timer=undefined;void flush();},100); timer.unref?.(); }
 return {
  emit(operation:Kind,stage:string,state:State,details:Record<string,unknown>={},context:Partial<OperationContext>=operationContext.getStore()??{},operationId=randomUUID()) {
   if(!enabled) return;
   const id=(value:string|undefined)=>value&&uuid.test(value)?value:null;
   if(queue.length>=1000) { logger.warn('Live operation queue is full; newest metadata was not queued'); return; }
   queue.push({operation_id:operationId, request_id:id(context.requestId)??randomUUID(),terminal_id:id(context.terminalId),merchant_id:id(context.merchantId),user_id:id(context.userId),scope_id:id(context.scopeId),operation,stage,state,occurred_at:new Date().toISOString(),details:safeOperationDetails(details)});
   schedule();
  }, flush,
 };
}
export const operations = createOperationRecorder(async batch => {
 const {error} = await db.rpc('append_operation_events',{p_events:batch}).abortSignal(AbortSignal.timeout(5000));
 if(error) throw new Error('operation_storage_unavailable');
},process.env.NODE_ENV !== 'test');

function classify(path:string, method:string): [Kind,string] | null {
 if(method !== 'POST') return path==='/terminal/me'?['terminal','connected']:null;
 if(path==='/enrol/sessions') return ['enrollment','session_create'];
 if(/^\/enrol\/sessions\/[^/]+\/claim$/.test(path)) return ['enrollment','session_claim'];
 if(/^\/enrol\/sessions\/[^/]+\/palm$/.test(path)) return ['enrollment','sample_submit'];
 if(path==='/palm/revoke')return ['enrollment','unlink'];
 if(path==='/transactions')return ['payment','sale_create'];
 if(/^\/transactions\/[^/]+\/authenticate$/.test(path))return ['identification','authenticate'];
 if(/^\/transactions\/[^/]+\/confirm$/.test(path))return ['payment','confirm'];
 if(/^\/transactions\/[^/]+\/cancel$/.test(path))return ['payment','cancel'];
 return null;
}
export function observeOperationRequest(req: Request,res:Response):void {
 const classified=classify(req.path,req.method); if(!classified) return;
 const context=operationContext.getStore()??{requestId:req.id};
 const scoped=req.path.split('/')[2];if(scoped&&uuid.test(scoped)) context.scopeId=scoped;
 const [kind,stage]=classified; const span=randomUUID(), started=performance.now();
 operations.emit(kind,stage,'started',{},context,span);
 const original=res.json; let details:Record<string,unknown>={};
 res.json=function(body:unknown) {
  if(body&&typeof body==='object') {
   const result=body as Record<string,unknown>;
   details=safeOperationDetails({score:result.score,decision:result.decision,amountMinor:result.amountMinor,result:result.status,
    errorCode: (result.error as {code?:unknown}|undefined)?.code});
   const reference=result.sessionId??result.transactionId;
   if(typeof reference==='string' && uuid.test(reference)) context.scopeId=reference;
  }
  return original.call(this,body);
 };
 let ended=false;
 res.once('finish',()=>{if(ended)return;ended=true;operations.emit(kind,stage,res.statusCode>=500?'failed':res.statusCode>=400||details.decision==='reject'?'rejected':'succeeded',
  {...details,durationMs:performance.now()-started},context,span);});
 res.once('close',()=>{if(ended)return;ended=true;operations.emit(kind,stage,'failed',{errorCode:'client_disconnected',durationMs:performance.now()-started},context,span);});
}
