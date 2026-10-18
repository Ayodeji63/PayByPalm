import type { NormalizedLandmark } from '@mediapipe/tasks-vision';
/** One worker, one in-flight frame, bounded preview copies. Full capture is separate. */
export class PalmTracker {
 private worker:Worker;
 private ready:Promise<void>;
 private failed=false;
 private busy=false;
 private sequence=0;
 private pending:{id:number;resolve:(hands:NormalizedLandmark[][])=>void;reject:(error:Error)=>void;timer:ReturnType<typeof setTimeout>}|null=null;
 constructor(){
  this.worker=new Worker('/palm-recognition.worker.js');
  this.ready=new Promise((resolve,reject)=>{
   const timer=setTimeout(()=>{this.failed=true;this.worker.terminate();reject(new Error('Palm guidance could not load.'));},30000);
   this.worker.onmessage=event=>{
    const m=event.data;
    if(m.type==='ready'){clearTimeout(timer);resolve();return;}
    if(m.type==='error'&&!this.pending){clearTimeout(timer);this.failed=true;this.worker.terminate();reject(new Error('Palm guidance unavailable.'));return;}
    const pending=this.pending;if(!pending||pending.id!==m.id)return;
    this.pending=null;clearTimeout(pending.timer);
    if(m.type==='result')pending.resolve(m.landmarks);
    else pending.reject(new Error('Palm guidance failed.'));
   };
   this.worker.onerror=()=>{
    clearTimeout(timer);this.failed=true;
    const pending=this.pending;if(pending){clearTimeout(pending.timer);pending.reject(new Error('Palm guidance failed.'));this.pending=null;}
    this.worker.terminate();reject(new Error('Palm guidance unavailable.'));
   };
   this.worker.postMessage({type:'init'});
  });
 }
 get unavailable():boolean{return this.failed;}
 initialize():Promise<void>{return this.ready;}
 async detect(video:HTMLVideoElement):Promise<NormalizedLandmark[][]|null>{
  if(this.busy)return null;
  if(this.failed)throw new Error('Palm guidance unavailable.');
  this.busy=true;
  let bitmap:ImageBitmap|null=null;
  try{
   await this.ready;
   const width=Math.min(384,video.videoWidth),height=Math.max(1,Math.round(video.videoHeight*width/video.videoWidth));
   bitmap=await createImageBitmap(video,{resizeWidth:width,resizeHeight:height,resizeQuality:'low'});
   const frame=bitmap;
   return await new Promise((resolve,reject)=>{
    const id=++this.sequence;
    const timer=setTimeout(()=>{this.pending=null;this.failed=true;this.worker.terminate();reject(new Error('Palm guidance timed out.'));},10000);
    this.pending={id,resolve,reject,timer};
    try{this.worker.postMessage({type:'frame',id,bitmap:frame,timestamp:performance.now()},[frame]);bitmap=null;}
    catch{clearTimeout(timer);this.pending=null;reject(new Error('Palm guidance unavailable.'));}
   });
  }finally{bitmap?.close();this.busy=false;}
 }
}
let tracker:PalmTracker|null=null;
export function getPalmTracker():PalmTracker{
 if(!tracker||tracker.unavailable)tracker=new PalmTracker();return tracker;
}
