import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const compiled=ts.transpileModule(readFileSync(new URL('../src/terminal/leds.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
function harness(configured=true){
 const listeners=new Set(),events=[];let counter=0;
 const window={addEventListener:(type,fn)=>{if(type==='message')listeners.add(fn);},removeEventListener:(_type,fn)=>listeners.delete(fn),postMessage:m=>{
  events.push(m.state);
  queueMicrotask(()=>{for(const fn of [...listeners])fn({source:window,origin:'https://wallet.example',data:{...m,type:'pbp-led-response',available:true}});});
 }};
 const exports={};vm.runInNewContext(compiled,{exports,window,document:{documentElement:{dataset:{paybypalmLedBridge:configured?'1':undefined}}},location:{origin:'https://wallet.example'},crypto:{randomUUID:()=>String(++counter)},setTimeout,clearTimeout,Promise});
 return {...exports,events};
}
test('white stays on throughout acquisition; OFF precedes processing; green waits for database success',async()=>{
 const h=harness(),op=h.beginLEDOperation();let resolveSave;
 const frame=await h.captureWithLight(op,async()=>{assert.deepEqual(h.events,['CAPTURING']);await new Promise(r=>setTimeout(r,10));assert.deepEqual(h.events,['CAPTURING']);return 'frame';},1);
 assert.equal(frame,'frame');assert.deepEqual(h.events,['CAPTURING','OFF','LOADING']);
 const saved=h.confirmedEnrollment(op,()=>new Promise(resolve=>{resolveSave=resolve;}));
 assert.equal(h.events.includes('SUCCESS'),false);resolveSave({status:'completed'});await saved;
 assert.deepEqual(h.events,['CAPTURING','OFF','LOADING','SUCCESS']);
});
test('failed capture and failed/unconfirmed backend writes signal error, never green',async()=>{
 for(const run of [async(h,op)=>h.captureWithLight(op,async()=>{throw Error('camera failed');},1),async(h,op)=>h.confirmedEnrollment(op,async()=>{throw Error('database failed');}),async(h,op)=>h.confirmedEnrollment(op,async()=>({status:'claimed'}))]){
  const h=harness(),op=h.beginLEDOperation();await assert.rejects(run(h,op));assert.equal(h.events.at(-1),'ERROR');assert.equal(h.events.includes('SUCCESS'),false);
 }
});
test('cancelled operations cannot switch off or show success over a newer capture',async()=>{
 const h=harness(),old=h.beginLEDOperation();await old.state('LOADING');const current=h.beginLEDOperation();await current.state('CAPTURING');old.close();await old.state('SUCCESS');
 assert.deepEqual(h.events,['LOADING','CAPTURING']);let called=false;
 await assert.rejects(h.confirmedEnrollment(old,async()=>{called=true;return {status:'completed'};}));assert.equal(called,false);
});
test('ordinary browser terminals and mobile devices require no bridge and keep capture working',async()=>{
 const h=harness(false),op=h.beginLEDOperation();assert.equal(await h.captureWithLight(op,async()=>42,1),42);assert.deepEqual(h.events,[]);
});

test('payment and enrollment previews stay white even while the hand model loads or fails',()=>{
 for(const name of ['Capture','Enrol'])for(const guidance of ['loading','error','place']){
  const effects=[],events=[],intervals=[];let slot=0;
  const jsx=(type,props)=>({type,props});
  const dependencies={
   react:{useEffect:fn=>effects.push(fn),useCallback:fn=>fn,useRef:current=>({current}),useState:initial=>{const index=slot++;return [name==='Capture'&&index===0?true:name==='Enrol'&&index===0?'capturing':name==='Enrol'&&index===1?{captureMode:'legacy',sessionId:'session',expiresAt:'2099-01-01'}:initial,()=>{}];}},
   'react/jsx-runtime':{jsx,jsxs:jsx},'qrcode.react':{QRCodeSVG:'QR'},
   '../leds.js':{beginLEDOperation:()=>({state:async state=>{events.push(state);},close:()=>{},active:()=>true})},
   '../useCamera.js':{useCamera:()=>({status:'ready',videoRef:{current:null}}),useAutoCapture:()=>({state:guidance,landmarks:[]})},
   '../api.js':{},'../config.js':{TIMINGS:{}},'../../lib/money.js':{formatNaira:()=>''},'../ui.js':{},'../H5PalmCapture.js':{H5PalmCapture:'H5'},
  };
  const source=readFileSync(new URL(`../src/terminal/screens/${name}.tsx`,import.meta.url),'utf8');
  const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
  const exports={};vm.runInNewContext(compiled,{exports,require:key=>dependencies[key],window:{setInterval:(fn,ms)=>{intervals.push({fn,ms});return 1;},clearInterval:()=>{}}});
  const rendered=exports[name]({amountMinor:100});
  if(name==='Capture')rendered.type(rendered.props); // Render the mock-only legacy camera child.
  // First effects are operation ownership cleanup and the camera LED lifecycle.
  effects[0]();const cleanup=effects[1]();
  assert.deepEqual(events,['CAPTURING'],`${name}: ${guidance}`);
  assert.equal(intervals[0].ms,5000);intervals[0].fn();
  assert.deepEqual(events,['CAPTURING','CAPTURING']);cleanup();
 }
});
