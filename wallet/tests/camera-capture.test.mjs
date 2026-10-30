import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const compile = file => ts.transpileModule(readFileSync(new URL(file,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
test('camera preparation and capture share one stream, then release every track',async()=>{
 let opens=0,stops=0;const track={readyState:'live',stop(){stops++;this.readyState='ended';}};
 const stream={getTracks:()=>[track],getVideoTracks:()=>[track]};const exports={};
 vm.runInNewContext(compile('../src/terminal/cameraStream.ts'),{exports,navigator:{mediaDevices:{getUserMedia:async()=>{opens++;return stream;}}},setTimeout,clearTimeout});
 const amount=exports.leaseCamera();await amount.ready;amount.release();const capture=exports.leaseCamera();assert.equal(await capture.ready,stream);assert.equal(opens,1);assert.equal(stops,0);
 capture.release();capture.release();await new Promise(resolve=>setTimeout(resolve,280));assert.equal(stops,1);
});
function captureHarness({frozen=false}={}){
 const canvases=[],states=[],dimensions=[];let encoded=0;const exports={};
 const dependencies={react:{useRef:current=>({current}),useState:initial=>[initial,value=>states.push(value)],useEffect:()=>{},useCallback:fn=>fn},'./palmTracker.js':{},'./cameraStream.js':{},'./config.js':{TIMINGS:{burstFrames:3,burstIntervalMs:100,ledExposureSettleMs:300}},'./leds.js':{captureWithLight:async(leds,acquire)=>acquire()}};
 const document={createElement(){const canvas={width:0,height:0,getContext(){return {drawImage(){dimensions.push([canvas.width,canvas.height]);},getImageData(){return {data:new Uint8Array(256*144*4).fill(80)};}};},toDataURL(type,quality){encoded++;return 'data:image/jpeg;base64,'+(quality>0.8?'A'.repeat(710000):Buffer.from(frozen?'same frame':`frame ${encoded}`).toString('base64'));}};canvases.push(canvas);return canvas;}};
 vm.runInNewContext(compile('../src/terminal/useCamera.ts'),{exports,require:key=>dependencies[key],document,performance,setTimeout,window:{setTimeout},Uint8Array,Float32Array});
 const camera=exports.useCamera(false);camera.videoRef.current={readyState:4,videoWidth:1280,videoHeight:720};return {camera,canvases,dimensions};
}
test('three independent JPEGs retain aspect ratio, fit 512 KiB, and are spaced 100ms apart',async()=>{
 const {camera,canvases,dimensions}=captureHarness(),progress=[],start=performance.now();
 const frames=await camera.captureBurst({active:()=>true},count=>progress.push(count));
 assert.equal(frames.length,3);assert.equal(new Set(frames.map(frame=>frame.imageB64)).size,3);assert.deepEqual(progress,[1,2,3]);assert.ok(performance.now()-start>=190);
 assert.ok(dimensions.some(([width,height])=>width===960 && height===540));
 assert.ok(frames.every(frame=>frame.bytes<=512*1024));assert.equal(canvases[1].width,0);assert.equal(canvases[1].height,0);
 frames.forEach(frame=>frame.imageB64='');
});
test('a stalled camera cannot submit duplicate enrollment frames',async()=>{
 const {camera}=captureHarness({frozen:true});await assert.rejects(camera.captureBurst({active:()=>true}),/three fresh frames/);
});
test('cancellation stops burst capture before another frame or submission',async()=>{
 const {camera}=captureHarness();let active=true;await assert.rejects(camera.captureBurst({active:()=>active},()=>{active=false;}),/cancelled/);
});
function guidanceHarness(){
 let now=0,sample,state;const effects=[],marks=[];
 const hand=Array.from({length:21},()=>({x:0.5,y:0.55,z:0}));
 for(const [index,x,y] of [[0,.5,.88],[4,.15,.5],[2,.28,.65],[8,.34,.12],[6,.38,.45],[12,.5,.08],[10,.5,.4],[16,.65,.14],[14,.62,.45],[20,.8,.25],[18,.7,.55]])hand[index]={x,y,z:0};
 let hands=[hand];const tracker={initialize:async()=>{},detect:async()=>hands};let hookState=0;
 const dependencies={react:{useState:initial=>{const index=hookState++;return[initial,value=>{if(index===0)state=value;}];},useEffect:fn=>effects.push(fn)},'./palmTracker.js':{getPalmTracker:()=>tracker},'./cameraStream.js':{},'./config.js':{},'./leds.js':{}};
 const exports={};vm.runInNewContext(compile('../src/terminal/useCamera.ts'),{exports,require:key=>dependencies[key],performance:{now:()=>now,mark:name=>marks.push(name)},window:{setInterval:(callback,ms)=>{assert.equal(ms,100);sample=callback;return 1;},clearInterval:()=>{}},setTimeout});
 exports.useAutoCapture({current:{readyState:4,videoWidth:1280,videoHeight:720}},true);effects[0]();
 return {async observe(time,offset=0){now=time;hands=[hand.map(point=>({...point,x:point.x+offset}))];await new Promise(resolve=>setImmediate(resolve));sample();await new Promise(resolve=>setImmediate(resolve));return state;},marks};
}
test('automatic capture requires valid stable observations spanning 300ms, and resets after motion',async()=>{
 const h=guidanceHarness();assert.equal(await h.observe(0),'moving');assert.equal(await h.observe(100),'moving');assert.equal(await h.observe(200),'moving');assert.equal(await h.observe(300),'ready');
 assert.equal(await h.observe(400,.03),'moving');assert.equal(await h.observe(500,.03),'moving');assert.equal(await h.observe(600,.03),'moving');assert.equal(await h.observe(700,.03),'ready');assert.equal(h.marks.length,2);
});
test('missing coverage or a long worker gap cannot reuse an old stability window',async()=>{
 const h=guidanceHarness();await h.observe(0);await h.observe(100);assert.equal(await h.observe(700),'moving');assert.equal(await h.observe(800),'moving');assert.equal(await h.observe(900,.5),'position');assert.equal(await h.observe(1000),'moving');assert.equal(await h.observe(1100),'moving');assert.equal(await h.observe(1200),'moving');assert.equal(await h.observe(1300),'ready');
});
