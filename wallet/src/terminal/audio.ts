/** One local speaker, no speech queue. Sound never gates capture or payment. */
export const AUDIO_FILES={ready:'ready.wav',move_left:'move_left.wav',move_right:'move_right.wav',move_closer:'move_closer.wav',move_back:'move_back.wav',open_hand:'open_hand.wav',palm_flat:'palm_flat.wav',hold_still:'hold_still.wav',scan_complete:'scan_complete.wav',processing:'processing.wav',retry_scan:'retry_scan.wav',payment_pending:'payment_pending.wav',payment_failed:'payment_failed.wav',cancelled:'cancelled.wav',success:'success1.wav'} as const;
export type AudioPrompt=keyof typeof AUDIO_FILES;
export type GuidancePrompt='move_left'|'move_right'|'move_closer'|'move_back'|'open_hand'|'palm_flat'|'hold_still';
export const AUDIO_ROOT='/audio/terminal/';
const PREFERENCE='paybypalm.terminal.audio';
type Player=Pick<HTMLAudioElement,'src'|'preload'|'muted'|'currentTime'|'pause'|'play'|'onended'|'onerror'>;
export class TerminalAudio {
 private player:Player|null=null;private generation=0;private timer:ReturnType<typeof setTimeout>|undefined;private processingTimer:ReturnType<typeof setTimeout>|undefined;
 private desired:GuidancePrompt|null=null;private current:AudioPrompt|null=null;private kind:'event'|'guidance'='event';private recent=new Map<AudioPrompt,number>();private completed=new Set<string>();
 private listeners=new Set<()=>void>();private snapshot:{enabled:boolean;blocked:boolean};
 constructor(private create:()=>Player=()=>new Audio(),private now=()=>Date.now()){
  let enabled=true;try{enabled=localStorage.getItem(PREFERENCE)!=='off';}catch{/* Default on for a new kiosk. */}
  this.snapshot={enabled,blocked:false};
 }
 subscribe=(listener:()=>void)=>{this.listeners.add(listener);return()=>{this.listeners.delete(listener);};};
 getSnapshot=()=>this.snapshot;
 private status(blocked:boolean){this.snapshot={...this.snapshot,blocked};this.listeners.forEach(fn=>fn());}
 setEnabled(enabled:boolean){this.stop();this.snapshot={enabled,blocked:false};try{localStorage.setItem(PREFERENCE,enabled?'on':'off');}catch{/* Preference is best effort. */}this.listeners.forEach(fn=>fn());if(enabled)this.unlock();}
 private getPlayer(){if(!this.player){this.player=this.create();this.player.preload='auto';}return this.player;}
 preload(){if(typeof fetch!=='function')return;for(const file of Object.values(AUDIO_FILES))void fetch(AUDIO_ROOT+file,{cache:'force-cache'}).then(response=>response.arrayBuffer()).catch(()=>{});}
 unlock(){
  if(!this.snapshot.enabled)return;
  try{
   const p=this.getPlayer(),revision=++this.generation;p.pause();p.muted=true;
   p.src='data:audio/wav;base64,UklGRiYAAABXQVZFZm10IBAAAAABAAEAgD4AAAB9AAACABAAZGF0YQIAAAAAAA==';
   void p.play().then(()=>{if(revision===this.generation){p.pause();p.muted=false;this.status(false);}}).catch(()=>{if(revision===this.generation){p.muted=false;this.status(true);}});
  }catch{this.status(true);}
 }
 private play(prompt:AudioPrompt,kind:'event'|'guidance'){
  if(!this.snapshot.enabled)return;
  if(this.current===prompt)return;
  const revision=++this.generation;
  try{
   const p=this.getPlayer();p.pause();p.muted=false;p.src=AUDIO_ROOT+AUDIO_FILES[prompt];p.currentTime=0;
   this.current=prompt;this.kind=kind;this.recent.set(prompt,this.now());
   p.onended=()=>{if(revision===this.generation)this.current=null;};
   p.onerror=()=>{if(revision===this.generation){this.current=null;this.status(true);}};
   void p.play().then(()=>{if(revision===this.generation)this.status(false);}).catch(()=>{if(revision===this.generation){this.current=null;this.status(true);}});
  }catch{this.current=null;this.status(true);}
 }
 event(prompt:AudioPrompt,key?:string){
  this.cancelGuidance();clearTimeout(this.processingTimer);
  if(key){if(this.completed.has(key))return;this.completed.add(key);if(this.completed.size>256)this.completed.delete(this.completed.values().next().value!);}
  this.play(prompt,'event');
 }
 guidance(prompt:GuidancePrompt|null){
  if(!prompt){this.cancelGuidance();return;}
  if(this.desired===prompt)return;
  this.desired=prompt;clearTimeout(this.timer);
  if(this.kind==='guidance'&&this.current!==prompt)this.hush();
  this.timer=setTimeout(()=>{
   if(this.desired!==prompt)return;
   const since=this.now()-(this.recent.get(prompt)??-Infinity);
   if(since>=4500)this.play(prompt,'guidance');
  },500);
 }
 cancelGuidance(){clearTimeout(this.timer);this.desired=null;if(this.kind==='guidance')this.hush();}
 reading(){this.event('scan_complete');const timer=setTimeout(()=>this.event('processing'),2100);this.processingTimer=timer;return()=>{clearTimeout(timer);if(this.processingTimer===timer)this.processingTimer=undefined;};}
 private hush(){this.generation++;this.player?.pause();this.current=null;}
 stop(){clearTimeout(this.timer);clearTimeout(this.processingTimer);this.desired=null;this.hush();}
}
export const terminalAudio=new TerminalAudio();
if(typeof window!=='undefined')window.addEventListener('pagehide',()=>terminalAudio.stop());

/** Coordinates refer to the unmirrored camera preview used by the Pi. */
export function guidanceForPalm(state:string,hand:readonly {x:number;y:number;z?:number}[]):GuidancePrompt|null{
 if(state==='open')return 'open_hand';
 if(state==='moving'||state==='ready')return 'hold_still';
 if(state!=='position'||hand.length!==21)return null;
 const xs=hand.map(p=>p.x),ys=hand.map(p=>p.y),minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys),width=maxX-minX,height=maxY-minY,centre=(minX+maxX)/2;
 if(centre<0.28)return 'move_right';if(centre>0.72)return 'move_left';
 if(minX<=0.025||maxX>=0.975||minY<=0.025||maxY>=0.975||width>=0.88||height>=0.95)return 'move_back';
 // Severe edge-on palm geometry; this guides the user without relaxing any gate.
 if(height>0.38&&width/height<0.35)return 'palm_flat';
 if(width<=0.22||height<=0.38)return 'move_closer';
 return 'palm_flat';
}
