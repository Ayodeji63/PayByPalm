import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync,readdirSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const source=readFileSync(new URL('../src/terminal/audio.ts',import.meta.url),'utf8');
const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
function harness(blocked=false){
 let now=0,next=0;const timers=new Map(),log=[],players=[];
 class Audio{
  src='';muted=false;preload='';currentTime=0;onended=null;onerror=null;playing=false;
  constructor(){players.push(this);}
  pause(){this.playing=false;}
  play(){if(players.some(p=>p!==this&&p.playing))throw new Error('Overlapping audio');this.playing=true;log.push(this.src);return blocked?Promise.reject(new Error('NotAllowedError')):Promise.resolve();}
 }
 const exports={};vm.runInNewContext(code,{exports,Audio,Date:{now:()=>now},setTimeout:(fn,ms)=>{const id=++next;timers.set(id,{fn,at:now+ms});return id;},clearTimeout:id=>timers.delete(id)});
 function advance(ms){const until=now+ms;for(;;){const pending=[...timers].filter(([,t])=>t.at<=until).sort((a,b)=>a[1].at-b[1].at)[0];if(!pending)break;now=pending[1].at;timers.delete(pending[0]);pending[1].fn();}now=until;}
 return {...exports,audio:new exports.TerminalAudio(()=>new Audio(),()=>now),log,players,advance};
}
test('a stable positioning prompt replaces obsolete guidance without overlap or queued speech',()=>{
 const h=harness();h.audio.guidance('move_left');h.advance(200);h.audio.guidance('move_right');h.advance(499);assert.equal(h.log.length,0);h.advance(1);assert.ok(h.log[0].endsWith('move_right.wav'));
 h.audio.guidance('move_back');assert.equal(h.players[0].playing,false);h.advance(500);assert.ok(h.log.at(-1).endsWith('move_back.wav'));assert.equal(h.players.length,1);
 h.audio.cancelGuidance();h.advance(10000);assert.equal(h.players[0].playing,false);assert.equal(h.log.length,2);
});
test('capture completion is separate from success and processing only plays if still needed',()=>{
 const h=harness();const finish=h.audio.reading();assert.ok(h.log[0].endsWith('scan_complete.wav'));finish();h.advance(3000);assert.equal(h.log.length,1);
 h.audio.stop();h.audio.reading();h.advance(2100);assert.ok(h.log.at(-1).endsWith('processing.wav'));assert.ok(h.log.every(file=>!file.endsWith('success1.wav')));
});
test('pending, cancellation and failure cannot become success; payment success uses success1 once per reference',()=>{
 const h=harness();for(const cue of ['payment_pending','cancelled','payment_failed'])h.audio.event(cue);
 assert.equal(h.log.some(file=>file.endsWith('success1.wav')),false);
 h.audio.event('success','paid:one');h.audio.stop();h.audio.event('success','paid:one');assert.equal(h.log.filter(file=>file.endsWith('success1.wav')).length,1);
 h.audio.event('success','paid:two');assert.equal(h.log.filter(file=>file.endsWith('success1.wav')).length,2);
});
test('muting and navigation clear outstanding prompts, and blocked autoplay never rejects business work',async()=>{
 const h=harness(true);h.audio.event('ready');await Promise.resolve();await Promise.resolve();assert.equal(h.audio.getSnapshot().blocked,true);
 h.audio.setEnabled(false);h.audio.guidance('move_left');h.advance(1000);assert.equal(h.log.length,1);
 h.audio.stop();h.advance(10000);assert.equal(h.players[0].playing,false);
});
test('positional instructions follow the existing unmirrored preview and detect clipped, small and edge-on palms',()=>{
 const h=harness(),hand=(x,y,w,height)=>Array.from({length:21},(_,i)=>({x:x+(i%2)*w,y:y+(i%3)/2*height,z:0}));
 assert.equal(h.guidanceForPalm('position',hand(.02,.1,.3,.7)),'move_right');
 assert.equal(h.guidanceForPalm('position',hand(.65,.1,.3,.7)),'move_left');
 assert.equal(h.guidanceForPalm('position',hand(.1,.01,.7,.98)),'move_back');
 assert.equal(h.guidanceForPalm('position',hand(.4,.4,.2,.3)),'move_closer');
 assert.equal(h.guidanceForPalm('position',hand(.4,.15,.15,.65)),'palm_flat');
 assert.equal(h.guidanceForPalm('open',[]),'open_hand');assert.equal(h.guidanceForPalm('moving',[]),'hold_still');assert.equal(h.guidanceForPalm('place',[]),null);
});
test('all 15 mapped recordings are real mono 24kHz 16-bit PCM WAVs',()=>{
 const h=harness();assert.equal(Object.keys(h.AUDIO_FILES).length,15);
 const root=new URL('../public/audio/terminal/',import.meta.url);assert.equal(readdirSync(root).filter(file=>file.endsWith('.wav')).length,15);
 for(const file of Object.values(h.AUDIO_FILES)){
  const wav=readFileSync(new URL(file,root));assert.equal(wav.toString('ascii',0,4),'RIFF');assert.equal(wav.toString('ascii',8,12),'WAVE');assert.equal(wav.readUInt16LE(20),1);assert.equal(wav.readUInt16LE(22),1);assert.equal(wav.readUInt32LE(24),24000);assert.equal(wav.readUInt16LE(34),16);
 }
});
