/** Present reader work and authoritative terminal decisions as separate outcomes. */
export interface OperationEvent {
 key:string;source:'backend'|'ccnet';operation_id:string;request_id:string;
 operation:string;stage:string;state:string;occurred_at:string;
 details:{upstreamRequestId?:string;decision?:string;score?:number;errorCode?:string;result?:string;providerMatched?:boolean};
}
const words=(value:string)=>value.replaceAll('_',' ');
const isMatch=(event:OperationEvent)=>['identification','verification'].includes(event.operation);
export function operationStatus(event:OperationEvent):{label:string;tone:string} {
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
  if(event.details.decision==='accept')return {label:'Palm accepted',tone:'succeeded'};
  if(event.details.decision==='step_up')return {label:'Further check required',tone:'rejected'};
  if(event.state==='started')return {label:'Checking palm',tone:'started'};
  if(event.state==='succeeded')return {label:'Request completed',tone:'observed'};
 }
 if(event.operation==='payment'&&event.details.result==='settled')return {label:'Payment confirmed',tone:'succeeded'};
 if(event.operation==='payment'&&event.stage==='confirm'&&event.state==='succeeded')return {label:'Pay request completed',tone:'observed'};
 return {label:words(event.state),tone:event.state};
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
 if(latest.details.decision==='accept')return {label:'Palm accepted',tone:'succeeded',score,explanation:'The backend accepted this palm for checkout. The customer must still tap Pay; this is not a payment confirmation.'};
 if(latest.details.decision==='step_up')return {label:'Further check required',tone:'rejected',score,explanation:'This palm has not been accepted for checkout. Follow the terminal instructions.'};
 return {label:'Authentication error',tone:'failed',explanation:latest.details.errorCode?`Backend error: ${words(latest.details.errorCode)}. Checkout approval was not confirmed.`:'No successful authentication decision was received from the backend.'};
}
