// Actual model/WASM + synthetic camera. No enrollment or payment API calls.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createServer} from 'node:http';
import {readFileSync} from 'node:fs';
import {resolve,basename} from 'node:path';
const require=createRequire(import.meta.url),{chromium}=require('playwright'),ts=require('typescript');
const sdk=resolve('node_modules/@mediapipe/tasks-vision');
const source=ts.transpileModule(readFileSync('src/terminal/palmTracker.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.ES2022,target:ts.ScriptTarget.ES2022}}).outputText;
let origin;
const server=createServer((req,res)=>{
 try{
  if(req.url==='/tracker.js'){res.setHeader('Content-Type','text/javascript');return res.end(source);}
  if(req.url==='/palm-recognition.worker.js'){
   res.setHeader('Content-Type','text/javascript');return res.end(readFileSync('public/palm-recognition.worker.js','utf8').replaceAll('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1',origin+'/sdk').replace('https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',origin+'/model.task'));
  }
  if(req.url==='/model.task')return res.end(readFileSync('/tmp/pbp-hand-landmarker.task'));
  if(req.url==='/sdk/vision_bundle.js'){res.setHeader('Content-Type','text/javascript');return res.end(readFileSync(sdk+'/vision_bundle.js'));}
  if(req.url?.startsWith('/sdk/wasm/')){res.setHeader('Content-Type',req.url.endsWith('.wasm')?'application/wasm':'text/javascript');return res.end(readFileSync(sdk+'/wasm/'+basename(req.url)));}
  res.setHeader('Content-Type','text/html');res.end(`<video autoplay muted></video><button onclick="window.clicks++">Touchscreen</button><script type="module">
   import {getPalmTracker} from '/tracker.js';window.clicks=0;window.ticks=0;setInterval(()=>window.ticks++,25);
   const tracker=getPalmTracker();window.model=tracker.initialize().then(()=>window.ready=true).catch(e=>{window.failure=e.message;throw e;});
   window.test=async()=>{await window.model;const stream=await navigator.mediaDevices.getUserMedia({video:{width:1280,height:720},audio:false});const v=document.querySelector('video');v.srcObject=stream;await v.play();
    const before=window.ticks;let frames=0;
    for(let i=0;i<5;i++){const result=await tracker.detect(v);if(Array.isArray(result))frames++;}
    const result={frames,ticksDuringInference:window.ticks-before,width:v.videoWidth,height:v.videoHeight};stream.getTracks().forEach(t=>t.stop());return result;
   };
  </script>`);
 }catch{res.statusCode=500;res.end('Fixture asset unavailable');}
});
let browser;
try{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));origin=`http://127.0.0.1:${server.address().port}`;
 browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE||undefined,args:['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream']});
 const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(origin);await page.waitForFunction(()=>window.ready===true||!!window.failure,{},{timeout:45000});assert.equal(await page.evaluate(()=>window.failure),undefined,JSON.stringify(errors));
 const running=page.evaluate(()=>window.test());await page.getByRole('button',{name:'Touchscreen'}).click();const result=await running;
 assert.equal(result.frames,5);assert.ok(result.ticksDuringInference>0);assert.equal(await page.evaluate(()=>window.clicks),1);assert.equal(result.width,1280);assert.equal(result.height,720);assert.deepEqual(errors,[]);
 console.log('PASS: actual MediaPipe worker inference; responsive touchscreen/timer; full 1280x720 stream retained. '+JSON.stringify(result));
}finally{await browser?.close();await new Promise(r=>server.close(r));}
