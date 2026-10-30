/** Best-effort progress metadata; never attach captures or credentials to events. */
import { terminalApi } from './api.js';
export interface CaptureEvent {
 scope:'enrollment'|'payment'; scopeId:string;
 stage:'scan_started'|'capture_started'|'frame_captured'|'capture_retake'|'capture_cancelled'|'guidance';
 frameCount?:number; guidance?:'loading'|'place'|'position'|'open'|'moving'|'ready'|'error';
}
const pending:CaptureEvent[]=[];let timer:ReturnType<typeof setTimeout>|undefined;let sending=false;
export function reportCaptureEvent(event:CaptureEvent) {
 if(pending.length>=64)return;
 pending.push(event);schedule();
}
function schedule(){if(timer)return;timer=setTimeout(()=>{timer=undefined;void flush();},500);}
async function flush(){
 if(sending){schedule();return;}if(!pending.length)return;
 sending=true;const events=pending.splice(0,16);
 try{await terminalApi.captureEvents(events);}catch{/* Observability never blocks capture or retries a payment. */}
 finally{sending=false;if(pending.length)schedule();}
}
