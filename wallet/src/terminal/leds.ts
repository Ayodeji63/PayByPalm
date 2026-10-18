/** Optional Pi-only bridge through the installed kiosk extension. No HTTP/GPIO. */
export type LEDState = 'OFF'|'LOADING'|'CAPTURING'|'SUCCESS'|'ERROR';
export interface LEDReply { configured:boolean; available:boolean; mock?:boolean; }
let owner=0;
export function requestLED(state:LEDState):Promise<LEDReply>{
 if(typeof document==='undefined'||document.documentElement.dataset.paybypalmLedBridge!=='1')return Promise.resolve({configured:false,available:false});
 return new Promise(resolve=>{
  const id=crypto.randomUUID();
  const done=(result:LEDReply)=>{clearTimeout(timer);window.removeEventListener('message',receive);resolve(result);};
  const receive=(event:MessageEvent)=>{
   if(event.source===window&&event.origin===location.origin&&event.data?.type==='pbp-led-response'&&event.data.id===id&&event.data.state===state)
    done({configured:true,available:event.data.available===true,mock:event.data.mock===true});
  };
  const timer=setTimeout(()=>done({configured:true,available:false}),1800);
  window.addEventListener('message',receive);
  window.postMessage({type:'pbp-led-request',id,state},location.origin);
 });
}
export interface LEDOperation { state:(state:LEDState)=>Promise<LEDReply>; active:()=>boolean; close:()=>void; }
export function beginLEDOperation():LEDOperation{
 const mine=++owner;
 return {
  active:()=>owner===mine,
  state:state=>owner===mine?requestLED(state):Promise.resolve({configured:false,available:false}),
  close:()=>{if(owner===mine){void requestLED('OFF');owner++;}},
 };
}
/** Only the acquisition callback runs under steady white. All processing follows OFF. */
export async function captureWithLight<T>(operation:LEDOperation,acquire:()=>Promise<T>,settleMs=300,onWarning?:(message:string)=>void):Promise<T>{
 const light=await operation.state('CAPTURING');
 if(light.configured&&!light.available)onWarning?.('Camera light unavailable. Check the LED ring and its power supply.');
 if(light.available)await new Promise(resolve=>setTimeout(resolve,settleMs));
 if(!operation.active())throw new Error('Palm capture was cancelled.');
 try{
  const result=await acquire();
  await operation.state('OFF');
  if(!operation.active())throw new Error('Palm capture was cancelled.');
  await operation.state('LOADING');
  return result;
 }catch(error){await operation.state('ERROR');throw error;}
}
export async function confirmedEnrollment<T extends {status:string}>(operation:LEDOperation,save:()=>Promise<T>):Promise<T>{
 try{
  if(!operation.active())throw new Error('Palm capture was cancelled.');
  const result=await save();
  if(!operation.active())throw new Error('Palm capture was cancelled.');
  if(result.status!=='completed')throw new Error('Palm linking was not confirmed. Check the enrolment status.');
  await operation.state('SUCCESS');return result;
 }catch(error){await operation.state('ERROR');throw error;}
}
// Best effort on navigation; EOF and the Python watchdog also clear the ring.
if(typeof window!=='undefined')window.addEventListener('pagehide',()=>{owner++;void requestLED('OFF');});
