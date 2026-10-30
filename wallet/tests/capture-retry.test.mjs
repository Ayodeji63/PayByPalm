import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
class TerminalApiError extends Error {constructor(status,code,message){super(message);this.status=status;this.code=code;}}
const flush=async()=>{for(let i=0;i<4;i++)await new Promise(resolve=>setImmediate(resolve));};
function harness(name,api){
 const effects=[],hooks=[],events=[],calls={bursts:0,exit:0,outcomes:[],errors:[]};let slot=0,stateSlot=0;
 const session={sessionId:'same-session',captureMode:'ccnet',expiresAt:'2099-01-01'};
 const jsx=(type,props)=>({type,props});
 const camera={status:'ready',videoRef:{current:null},captureBurst:async(_leds,progress)=>{calls.bursts++;return [1,2,3].map(n=>{progress?.(n);return {imageB64:`burst-${calls.bursts}-frame-${n}`};});},captureBest:async()=>({imageB64:`payment-${++calls.bursts}`})};
 const dependencies={react:{useState(initial){const index=slot++,stateIndex=stateSlot++;if(!(index in hooks))hooks[index]=name==='Enrol'&&stateIndex===0?'capturing':name==='Enrol'&&stateIndex===1?session:initial;return [hooks[index],value=>hooks[index]=typeof value==='function'?value(hooks[index]):value];},useRef(initial){const index=slot++;if(!(index in hooks))hooks[index]={current:initial};return hooks[index];},useEffect:fn=>effects.push(fn),useCallback:fn=>fn},'react/jsx-runtime':{jsx,jsxs:jsx},'qrcode.react':{QRCodeSVG:'QR'},'../api.js':{terminalApi:api,TerminalApiError},'../leds.js':{beginLEDOperation:()=>({state:async()=>{},active:()=>true,close:()=>{}}),confirmedEnrollment:async(_leds,submit)=>submit()},'../useCamera.js':{useCamera:()=>camera,useAutoCapture:()=>({state:'place',landmarks:[]})},'../config.js':{TIMINGS:{}},'../ui.js':{TButton:'Button',CameraPane:'Camera',Pane:'Pane'},'../captureTelemetry.js':{reportCaptureEvent:event=>events.push(event)},'../cameraStream.js':{},'../H5PalmCapture.js':{},'../../lib/money.js':{formatNaira:()=>''}};
 const compiled=ts.transpileModule(readFileSync(new URL(`../src/terminal/screens/${name}.tsx`,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 const exports={};vm.runInNewContext(compiled,{exports,require:key=>dependencies[key],performance,Date,Error});
 const props={captureMode:'ccnet',transactionId:'same-sale',amountMinor:5000,onExit:()=>calls.exit++,onCancel:()=>calls.exit++,onOutcome:value=>calls.outcomes.push(value),onError:value=>calls.errors.push(value)};
 let component=exports[name];if(name==='Capture'){component=exports.Capture(props).type;hooks.length=0;}
 const render=()=>{slot=0;stateSlot=0;return component(props);};
 function find(label,type='Button'){function walk(node){if(Array.isArray(node)){for(const child of node){const found=walk(child);if(found)return found;}}else if(node&&typeof node==='object'){if(node.type===type&&(!label||node.props.children===label))return node;return walk(node.props?.children);}return null;}return walk(render());}
 return {find,calls,events,session,render,create:()=>{render();effects.find(effect=>effect.toString().includes('newSession'))();}};
}
test('definite rejection retakes three fresh frames inside the same enrollment session',async()=>{
 const submissions=[];const h=harness('Enrol',{registerPalmSamples:async(id,images)=>{submissions.push({id,images:[...images]});if(submissions.length===1)throw new TerminalApiError(422,'palm_capture_rejected','Unclear palm');return {status:'completed',userDisplayName:'Payer'};}});
 h.find('Capture').props.onClick();await flush();assert.ok(h.find('Retake'));assert.equal(h.calls.exit,0);h.find('Retake').props.onClick();await flush();
 assert.equal(h.calls.bursts,2);assert.deepEqual(submissions.map(s=>s.id),['same-session','same-session']);assert.notDeepEqual(submissions[0].images,submissions[1].images);assert.ok(h.find('Done'));
});
test('unknown writes retry original images without a fresh capture or QR session',async()=>{
 const submissions=[];const h=harness('Enrol',{registerPalmSamples:async(id,images)=>{submissions.push({id,images:[...images]});if(submissions.length===1)throw new TerminalApiError(503,'palm_reader_unavailable','Reader unavailable');return {status:'completed',userDisplayName:'Payer'};}});
 h.find('Capture').props.onClick();await flush();assert.ok(h.find('Retry linking'));h.find('Retry linking').props.onClick();await flush();
 assert.equal(h.calls.bursts,1);assert.deepEqual(submissions[0],submissions[1]);assert.ok(h.find('Done'));assert.equal(h.calls.exit,0);
});
test('double capture taps submit one burst only',async()=>{
 let resolve;let submissions=0;const h=harness('Enrol',{registerPalmSamples:()=>{submissions++;return new Promise(r=>{resolve=r;});}});
 const button=h.find('Capture');button.props.onClick();button.props.onClick();await flush();assert.equal(h.calls.bursts,1);assert.equal(submissions,1);resolve({status:'completed',userDisplayName:'Payer'});await flush();
});
test('payment mismatch stays on scan and retakes against the same sale',async()=>{
 const sales=[];const h=harness('Capture',{authenticate:async id=>{sales.push(id);return sales.length===1?{decision:'reject',message:'No confident match'}:{decision:'accept',transactionId:id};}});
 h.find('Capture').props.onClick();await flush();assert.ok(h.find('Retake'));assert.equal(h.calls.exit,0);assert.equal(h.calls.errors.length,0);assert.equal(h.calls.outcomes.length,0);
 h.find('Retake').props.onClick();await flush();assert.deepEqual(sales,['same-sale','same-sale']);assert.equal(h.calls.outcomes.length,1);assert.equal(h.calls.outcomes[0].decision,'accept');
});

test('duplicate startup effects share a single QR-session creation',async()=>{
 let count=0,resolve;const h=harness('Enrol',{createEnrolSession:()=>{count++;return new Promise(r=>{resolve=r;});}});h.create();h.create();await flush();assert.equal(count,1);resolve(h.session);await flush();
});
