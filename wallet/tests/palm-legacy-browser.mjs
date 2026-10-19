// Original camera UI + synthetic Chromium camera; fixture APIs/guidance only.
// No real biometrics, Tencent requests, registration or card charges.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdirSync} from 'node:fs';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser=await chromium.launch({
 executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE||chromium.executablePath(),
 args:['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream'],
});
const origin=process.env.PBP_PREVIEW_ORIGIN||'http://127.0.0.1:4186';
const artifacts='/tmp/paybypalm-legacy-browser';mkdirSync(artifacts,{recursive:true});
const txn='cccccccc-cccc-4ccc-8ccc-cccccccccccc',enrol='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
try {
 for(const viewport of [{width:800,height:480},{width:1280,height:720}]) {
  const context=await browser.newContext({viewport,hasTouch:true,permissions:['camera']});
  const calls=[],errors=[],vendorRequests=[];
  await context.addInitScript(()=>{
   sessionStorage.setItem('paybypalm.terminalKey','fixture-device-key');window.__ledStates=[];
   const enable=()=>{document.documentElement.dataset.paybypalmLedBridge='1';};
   if(document.documentElement)enable();else document.addEventListener('DOMContentLoaded',enable,{once:true});
   window.addEventListener('message',event=>{
    if(event.source!==window||event.data?.type!=='pbp-led-request')return;
    window.__ledStates.push(event.data.state);
    window.postMessage({...event.data,type:'pbp-led-response',available:true,mock:true},location.origin);
   });
  });
  await context.route('**/*',async route=>{
   const req=route.request(),url=new URL(req.url()),path=url.pathname;
   if(url.hostname.includes('tencent')||url.hostname.includes('youtu.qq.com'))vendorRequests.push(path);
   if(path==='/palm-recognition.worker.js')return route.fulfill({contentType:'text/javascript',body:`self.onmessage=e=>{if(e.data.type==='init')self.postMessage({type:'ready'});else{e.data.bitmap.close();self.postMessage({type:'result',id:e.data.id,landmarks:[]});}};`});
   const api=path==='/terminal/me'||path==='/health'||path.startsWith('/transactions')||path.startsWith('/enrol/');
   if(!api)return url.origin===origin?route.continue():route.abort();
   const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'Content-Type,X-Terminal-Key','Access-Control-Allow-Methods':'GET,POST,OPTIONS','Cache-Control':'no-store'};
   if(req.method()==='OPTIONS')return route.fulfill({status:204,headers});
   const body=req.postDataJSON();calls.push({path,body,method:req.method()});
   let data;
   if(path==='/terminal/me')data={terminalId:'terminal',terminalLabel:'Counter 1',merchantName:'Test merchant',captureMode:'legacy'};
   else if(path==='/health')data={status:'ok'};
   else if(path==='/transactions')data={transactionId:txn,amountMinor:100,status:'pending'};
   else if(path.endsWith('/palm-capture'))data={captureMode:'legacy'};
   else if(path.endsWith('/authenticate'))data={decision:'accept',mode:'compare',score:95,maskedName:'Test U.',cardLast4:'4081',cardBrand:'visa',pinRequired:false};
   else if(path.endsWith('/confirm'))data={transactionId:txn,amountMinor:100,settledAt:new Date().toISOString(),maskedName:'Test U.',merchantName:'Test merchant',terminalLabel:'Counter 1'};
   else if(path==='/enrol/sessions')data={sessionId:enrol,linkUrl:origin+'/scan/'+enrol,expiresAt:new Date(Date.now()+90000).toISOString(),captureMode:'legacy'};
   else if(path.endsWith('/palm'))data={status:'completed',userDisplayName:'Test U.',alreadyCompleted:false};
   else if(path==='/enrol/sessions/'+enrol)data={sessionId:enrol,status:'claimed',expiresAt:new Date(Date.now()+90000).toISOString(),userDisplayName:'Test U.'};
   else throw new Error('Unexpected fixture route '+path);
   return route.fulfill({status:200,json:data,headers});
  });
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  await page.goto(origin+'/terminal');
  await page.getByRole('button',{name:'New sale',exact:true}).click();
  await page.getByRole('button',{name:'1',exact:true}).click();
  await page.getByRole('button',{name:'Charge',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('video')?.readyState>=2);
  const dimensions=await page.locator('video').evaluate(v=>({width:v.videoWidth,height:v.videoHeight}));
  assert.deepEqual(dimensions,{width:1280,height:720});
  assert.equal(await page.locator('iframe').count(),0);
  assert.equal(calls.some(c=>c.path.endsWith('/palm-capture')),false,'original camera should open without an extra capture-token round trip');
  assert.equal(await page.evaluate(()=>window.__ledStates.at(-1)),'CAPTURING');
  await page.screenshot({path:`${artifacts}/payment-${viewport.width}.png`});
  await page.getByRole('button',{name:'Capture',exact:true}).click();
  await page.getByRole('button',{name:'Pay from card',exact:true}).waitFor();
  const auth=calls.find(c=>c.path.endsWith('/authenticate'));
  assert.deepEqual(Object.keys(auth.body),['imageB64']);
  assert.equal(Buffer.from(auth.body.imageB64,'base64').subarray(0,3).toString('hex'),'ffd8ff');
  assert.equal(calls.some(c=>c.path.endsWith('/confirm')),false,'capture cannot initiate a card charge');
  assert.equal((await page.evaluate(()=>window.__ledStates)).includes('SUCCESS'),false);
  await page.getByRole('button',{name:'Pay from card',exact:true}).click();
  await page.getByText('Payment complete',{exact:true}).waitFor();
  await page.reload();
  await page.getByRole('button',{name:'Enrol new user',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('video')?.readyState>=2);
  assert.equal(await page.locator('iframe').count(),0);
  assert.equal(await page.evaluate(()=>window.__ledStates.at(-1)),'CAPTURING');
  await page.screenshot({path:`${artifacts}/enrol-${viewport.width}.png`});
  await page.getByRole('button',{name:'Capture',exact:true}).click();
  await page.getByText('Palm linked',{exact:true}).waitFor();
  assert.deepEqual(Object.keys(calls.find(c=>c.path.endsWith('/palm')).body),['imageB64']);
  assert.equal(calls.some(c=>c.path==='/enrol/sessions/'+enrol+'/palm-capture'),false);
  assert.deepEqual(vendorRequests,[],'legacy mode must not load Tencent H5 scripts, frames or WASM');
  assert.deepEqual(errors,[]);
  console.log(`PASS: ${viewport.width}x${viewport.height} original camera payment/enrolment, full-resolution JPEG, white lighting, explicit card confirmation, no H5 requests. Fixtures only.`);
  await context.close();
 }
} finally {await browser.close();}
