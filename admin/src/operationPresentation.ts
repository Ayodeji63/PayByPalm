/** Present reader work and authoritative terminal decisions as separate outcomes. */
export interface OperationEvent {
 key:string;source:'backend'|'ccnet';operation_id:string;request_id:string;
 operation:string;stage:string;state:string;occurred_at:string;scope_id?:string|null;
 details:{upstreamRequestId?:string;decision?:string;score?:number;errorCode?:string;result?:string;providerMatched?:boolean;frameCount?:number;sampleCount?:number};
}
const words=(value:string)=>value.replaceAll('_',' ');
const isMatch=(event:OperationEvent)=>['identification','verification'].includes(event.operation);
export function operationStatus(event:OperationEvent):{label:string;tone:string} {
 if(event.operation==='payment'){
  if(event.source==='backend'&&event.state==='succeeded'&&event.details.result==='settled')return {label:'Payment confirmed',tone:'succeeded'};
  if(event.details.result==='cancelled')return {label:'Cancelled',tone:'observed'};
  if(event.stage==='cancel')return {label:event.state==='started'?'Cancelling payment':event.state==='succeeded'?'Cancellation requested':'Cancellation failed',tone:event.state==='started'?'started':event.state==='succeeded'?'observed':'failed'};
  if(event.details.errorCode==='card_payment_pending'||['pending','processing'].includes(event.details.result??''))return {label:'Payment processing',tone:'started'};
  if(event.details.result==='failed')return {label:'Payment failed',tone:'failed'};
  if(event.details.result==='manual_review')return {label:'Payment needs review',tone:'rejected'};
  if(event.stage==='confirm')return {label:event.state==='started'?'Confirming payment':event.state==='succeeded'?'Confirmation received':'Confirmation error',tone:event.state==='started'?'started':event.state==='succeeded'?'observed':'failed'};
 }
 if(event.operation==='capture'){
  if(event.stage==='frame_captured')return {label:event.details.frameCount===3?'Palm captured':'Capturing palm',tone:'observed'};
  if(event.stage==='capture_cancelled')return {label:'Capture cancelled',tone:'observed'};
  if(event.stage==='capture_retake')return {label:'Retake requested',tone:'observed'};
 }
 if(event.operation==='enrollment'&&event.state==='succeeded'){
  if(event.stage==='unlink')return {label:'Palm unlinked',tone:'observed'};
  if(event.stage==='delete'||event.stage==='delete_template')return {label:'Template deleted',tone:'observed'};
  return {label:event.source==='ccnet'?'Template stored':event.stage==='sample_submit'||event.stage==='register'?'Palm enrolled':'Enrollment updated',tone:'observed'};
 }
 if(isMatch(event)&&(event.source==='ccnet'||['search','compare'].includes(event.stage))){
  const action=event.operation==='identification'?'Search':'Comparison';
  if(event.state==='succeeded')return {label:`${action} completed`,tone:'observed'};
  if(event.state==='started')return {label:`${action} running`,tone:'started'};
  if(event.state==='rejected'&&event.details.providerMatched===false)return {label:'Reader found no match',tone:'rejected'};
  if(event.state==='rejected')return {label:'Reader rejected capture',tone:'rejected'};
  if(event.state==='failed')return {label:'Reader error',tone:'failed'};
 }
 if(event.source==='backend'&&event.stage==='authenticate'){
  if(event.details.decision==='reject')return {label:'Palm rejected',tone:'rejected'};
  if(event.details.decision==='accept')return {label:'Palm accepted',tone:'observed'};
  if(event.details.decision==='step_up')return {label:'Further check required',tone:'rejected'};
  if(event.state==='started')return {label:'Checking palm',tone:'started'};
  if(event.state==='succeeded')return {label:'Request completed',tone:'observed'};
 }
 return event.state==='succeeded'?{label:'Completed',tone:'observed'}:{label:words(event.state),tone:event.state};
}
function backendRequest(event:OperationEvent,events:readonly OperationEvent[]) {
 if(event.source==='backend')return event.request_id;
 return events.find(candidate=>candidate.source==='backend'&&candidate.details.upstreamRequestId===event.request_id)?.request_id;
}
export function operationTrace<T extends OperationEvent>(event:T,events:readonly T[]):T[] {
 const request=backendRequest(event,events);
 const upstream=new Set(events.filter(candidate=>candidate.source==='backend'&&candidate.request_id===request).map(candidate=>candidate.details.upstreamRequestId).filter(Boolean));
 return events.filter(candidate=>candidate.source===event.source&&candidate.operation_id===event.operation_id||candidate.source==='backend'&&candidate.request_id===request||candidate.source==='ccnet'&&upstream.has(candidate.request_id)).slice().sort((a,b)=>a.occurred_at.localeCompare(b.occurred_at)||a.key.localeCompare(b.key,undefined,{numeric:true}));
}
export function authenticationStatus(event:OperationEvent,events:readonly OperationEvent[]):{label:string;tone:string;explanation:string;score?:number} {
 const request=backendRequest(event,events);
 const candidates=events.filter(candidate=>candidate.source==='backend'&&candidate.request_id===request&&candidate.stage==='authenticate');
 // A shared/reused correlation ID must never borrow another attempt's approval.
 const spans=new Set(candidates.map(candidate=>candidate.operation_id));
 if(spans.size!==1)return {label:'Decision unavailable',tone:'observed',explanation:'No linked terminal authentication decision was received. Check the backend deployment and operation logging. Reader completion alone does not approve checkout.'};
 const latest=candidates.slice().sort((a,b)=>b.occurred_at.localeCompare(a.occurred_at)||b.key.localeCompare(a.key,undefined,{numeric:true}))[0]!;
 const score=latest.details.score;
 if(latest.state==='started')return {label:'Decision pending',tone:'started',explanation:'The backend is still checking this palm. Checkout has not been authorized.'};
 if(latest.details.decision==='reject'){
  const explanations:Record<string,string>={low_score:'The match score is below the payment threshold. Retake the palm on the same sale.',no_match:'The reader did not produce a qualifying match. Retake the palm on the same sale.',ambiguous_match:'The reader candidates could not be distinguished. Retake the palm on the same sale.',no_candidates:'No active eligible palm binding was available.',no_active_card:'The account has no active default card.',no_active_palm:'The account has no active enrolled palm.',strong_match_required:'The payment policy requires a stronger match.'};
  return {label:'Palm rejected',tone:'rejected',score,explanation:explanations[latest.details.errorCode??'']??'The backend rejected this palm for checkout. Retake or follow the terminal instructions.'};
 }
 if(latest.details.decision==='accept')return {label:'Palm accepted',tone:'observed',score,explanation:'The backend accepted this palm for checkout. The customer must still tap Pay; this is not a payment confirmation.'};
 if(latest.details.decision==='step_up')return {label:'Further check required',tone:'rejected',score,explanation:'This palm has not been accepted for checkout. Follow the terminal instructions.'};
 return {label:'Authentication error',tone:'failed',explanation:latest.details.errorCode?`Backend error: ${words(latest.details.errorCode)}. Checkout approval was not confirmed.`:'No successful authentication decision was received from the backend.'};
}


/** Keep only useful milestones in the register; retain the full feed for Details. */
export function importantOperations<T extends OperationEvent>(input:readonly T[]):T[] {
 const sorted=input.slice().sort((a,b)=>b.occurred_at.localeCompare(a.occurred_at)||b.key.localeCompare(a.key,undefined,{numeric:true}));
 const spans=new Map<string,T>();for(const event of sorted){const key=`${event.source}:${event.operation_id}`;if(!spans.has(key))spans.set(key,event);}
 const finished=[...spans.values()].filter(event=>event.state!=='started');
 const roots=new Set(finished.filter(event=>event.source==='backend'&&['authenticate','sample_submit','unlink'].includes(event.stage)).map(event=>event.request_id));
 const readers=new Set(finished.filter(event=>event.source==='backend').map(event=>event.details.upstreamRequestId).filter(Boolean));
 const payments=new Map<string,T>();
 for(const event of finished.filter(event=>event.operation==='payment')){
  if(event.stage==='sale_create'&&event.state==='succeeded')continue;
  const key=event.scope_id??event.request_id,existing=payments.get(key);
  // A later failed cancellation cannot erase a previously confirmed payment.
  if(!existing||operationStatus(event).label==='Payment confirmed'&&operationStatus(existing).label!=='Payment confirmed')payments.set(key,event);
 }
 return finished.filter(event=>{
  if(event.operation==='payment')return payments.get(event.scope_id??event.request_id)===event;
  if(event.operation==='capture')return event.stage==='frame_captured'&&event.details.frameCount===3||event.stage==='capture_retake'||event.stage==='capture_cancelled'&&(!event.scope_id||!payments.has(event.scope_id))||['failed','rejected'].includes(event.state);
  if(event.operation==='terminal')return ['failed','rejected'].includes(event.state);
  if(event.source==='ccnet')return !readers.has(event.request_id);
  if(['search','compare','register','delete'].includes(event.stage)&&roots.has(event.request_id))return false;
  if(event.operation==='enrollment')return ['sample_submit','unlink','register','delete'].includes(event.stage)||['failed','rejected'].includes(event.state);
  return ['identification','verification'].includes(event.operation)||['failed','rejected'].includes(event.state);
 });
}

export function scopeTrace<T extends OperationEvent>(event:T,events:readonly T[]):T[] {
 const exact=operationTrace(event,events),related=event.scope_id?events.filter(candidate=>candidate.scope_id===event.scope_id):[];
 return [...new Map([...exact,...related].map(candidate=>[candidate.key,candidate])).values()].sort((a,b)=>a.occurred_at.localeCompare(b.occurred_at)||a.key.localeCompare(b.key,undefined,{numeric:true}));
}
export const OPERATION_PAGE_SIZE=10;
export function operationPage<T>(events:readonly T[],requested:number){
 const pages=Math.max(1,Math.ceil(events.length/OPERATION_PAGE_SIZE));const page=Math.max(1,Math.min(requested,pages));
 return {page,pages,total:events.length,start:events.length?(page-1)*OPERATION_PAGE_SIZE+1:0,end:Math.min(page*OPERATION_PAGE_SIZE,events.length),events:events.slice((page-1)*OPERATION_PAGE_SIZE,page*OPERATION_PAGE_SIZE)};
}
