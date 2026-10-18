// Actual Chromium extension/native messaging + real browser camera API using
// Chromium's synthetic camera and the Python MockStrip. No Pi GPIO or cloud calls.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createServer} from 'node:http';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const require=createRequire(import.meta.url),{chromium}=require('playwright');
const ts=createRequire(resolve('wallet/package.json'))('typescript');
const root=mkdtempSync(join(tmpdir(),'pbp-led-browser-'));
const eventsPath=join(root,'frames.jsonl');
const ledModule=ts.transpileModule(readFileSync('wallet/src/terminal/leds.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.ES2022,target:ts.ScriptTarget.ES2022}}).outputText;
const server=createServer((req,res)=>{
 if(req.url==='/leds.js'){res.setHeader('Content-Type','text/javascript');return res.end(ledModule);}
 res.setHeader('Content-Type','text/html');res.end(`<p id="status">Ready</p><video autoplay muted></video><script type="module">
 import {beginLEDOperation,captureWithLight,confirmedEnrollment} from '/leds.js';
 window.cameraReady=navigator.mediaDevices.getUserMedia({video:true,audio:false}).then(async stream=>{const v=document.querySelector('video');v.srcObject=stream;await v.play();});
 window.run=async(fail=false)=>{
  await window.cameraReady;const op=beginLEDOperation();window.operation=op;window.acquisition=[];
  try{
   await captureWithLight(op,async()=>{document.querySelector('#status').textContent='Capturing';const v=document.querySelector('video'),c=document.createElement('canvas');c.width=v.videoWidth;c.height=v.videoHeight;
    for(let i=0;i<3;i++){window.acquisition.push(Date.now());c.getContext('2d').drawImage(v,0,0);if(!c.toDataURL('image/jpeg').startsWith('data:image/jpeg'))throw Error('Missing camera frame');await new Promise(r=>setTimeout(r,30));}
    window.captureEnd=Date.now();return 'synthetic frame';},40);
   document.querySelector('#status').textContent='Saving';
   await confirmedEnrollment(op,()=>new Promise((resolve,reject)=>{window.finish=()=>fail?reject(Error('Simulated database save failure')):resolve({status:'completed'});}));
   document.querySelector('#status').textContent='Palm linked';
  }catch(e){document.querySelector('#status').textContent=e.message;}
 };
 </script>`);
});
let browser;
const frames=()=>existsSync(eventsPath)?readFileSync(eventsPath,'utf8').trim().split('\n').filter(Boolean).map(x=>JSON.parse(x)):[];
const isColor=(frame,rgb)=>frame.pixels.every(p=>p.join(',')===rgb.join(','));
try{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin=`http://127.0.0.1:${server.address().port}`;
 const config=join(root,'terminal.env'),extension=join(root,'extension'),profile=join(root,'profile');
 mkdirSync(extension,{mode:0o700});mkdirSync(join(profile,'NativeMessagingHosts'),{recursive:true});
 writeFileSync(config,`KIOSK_URL=${origin}/terminal\nTERMINAL_KEY=pbp_${'a'.repeat(64)}\n`,{mode:0o600});writeFileSync(join(root,'led-enabled'),'');
 execFileSync('python3',[resolve('pi/prepare-kiosk.py'),'--config',config,'--extension-dir',extension]);
 const publicKey=readFileSync('pi/led-extension-key.txt','utf8').trim();const hash=createHash('sha256').update(Buffer.from(publicKey,'base64')).digest('hex').slice(0,32);const extensionId=[...hash].map(x=>String.fromCharCode(97+parseInt(x,16))).join('');
 const host=join(root,'host.py');
 writeFileSync(host,`#!/usr/bin/python3\nimport sys,json,time\nsys.path.insert(0,${JSON.stringify(resolve('pi'))})\nfrom led_controller import LEDController,MockStrip\nfrom led_host import serve\nclass RecordingStrip(MockStrip):\n def render(self,pixels,brightness):\n  super().render(pixels,brightness)\n  with open(${JSON.stringify(eventsPath)},'a') as f:f.write(json.dumps({'time':time.time()*1000,'pixels':pixels,'brightness':brightness})+'\\n')\ncontroller=LEDController(strip=RecordingStrip())\nserve(controller,sys.stdin.buffer,sys.stdout.buffer)\n`,{mode:0o700});
 writeFileSync(join(profile,'NativeMessagingHosts/org.paybypalm.led.json'),JSON.stringify({name:'org.paybypalm.led',description:'Isolated LED test',path:host,type:'stdio',allowed_origins:[`chrome-extension://${extensionId}/`]}));
 browser=await chromium.launchPersistentContext(profile,{channel:'chromium',headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE||undefined,args:[`--disable-extensions-except=${extension}`,`--load-extension=${extension}`,'--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream']});
 const page=await browser.newPage();await page.goto(origin+'/terminal');await page.waitForFunction(()=>typeof window.run==='function');
 assert.equal(await page.evaluate(()=>document.documentElement.dataset.paybypalmLedBridge),'1');
 const run=page.evaluate(()=>window.run());
 await page.getByText('Saving',{exact:true}).waitFor();
 const before=frames();assert.equal(before.some(f=>isColor(f,[0,255,0])),false,'green must wait for the backend save');
 const capture=await page.evaluate(()=>({times:window.acquisition,end:window.captureEnd}));
 for(const time of capture.times){const during=before.filter(f=>f.time<=time).at(-1);assert.ok(during&&isColor(during,[255,255,255]),'all LEDs must stay white during every acquired camera frame');assert.equal(during.brightness,50);}
 assert.equal(before.filter(f=>f.time>capture.times[0]&&f.time<capture.end).length,0,'no chase/flash during the burst');
 assert.ok(before.some(f=>f.time>=capture.end&&f.pixels.filter(p=>p[2]===255&&p[0]===0).length===1),'blue chase must follow acquisition');
 await page.evaluate(()=>window.finish());await run;await page.getByText('Palm linked',{exact:true}).waitFor();
 assert.ok(frames().some(f=>isColor(f,[0,255,0])));
 await page.waitForTimeout(2200);assert.ok(isColor(frames().at(-1),[0,0,0]));
 const fail=page.evaluate(()=>window.run(true));await page.getByText('Saving',{exact:true}).waitFor();await page.evaluate(()=>window.finish());await fail;
 await page.getByText('Simulated database save failure',{exact:true}).waitFor();assert.ok(isColor(frames().at(-1),[255,0,0]));await page.waitForTimeout(2200);assert.ok(isColor(frames().at(-1),[0,0,0]));
 for(const path of ['/login','/terminal-extra']){const other=await browser.newPage();await other.goto(origin+path);assert.equal(await other.evaluate(()=>document.documentElement.dataset.paybypalmLedBridge),undefined);await other.close();}
 await page.evaluate(()=>window.operation.state('CAPTURING'));await page.goto(origin+'/login');await page.waitForTimeout(200);assert.ok(isColor(frames().at(-1),[0,0,0]),'navigation must clear the light');
 console.log('PASS: real Chromium/native Python bridge; synthetic camera burst stays white; OFF then blue; green only after save; save failure red; feedback expires; navigation clears; unrelated routes excluded. Mock hardware only.');
}finally{
 await browser?.close();await new Promise(r=>server.close(r));rmSync(root,{recursive:true,force:true});
}
