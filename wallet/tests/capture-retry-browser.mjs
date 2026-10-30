// Synthetic camera and API fixtures only; no real biometrics or payment calls.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdirSync} from 'node:fs';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE||'playwright');
const origin=process.env.PBP_PREVIEW_ORIGIN||'http://127.0.0.1:5177',out='/tmp/paybypalm-retake-browser';mkdirSync(out,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,args:['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream']});
const session='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',txn='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
try{
 const context=await browser.newContext({viewport:{width:800,height:480},permissions:['camera'],hasTouch:true});const errors=[],calls=[];let enrollAttempts=0,matches=0;
 await context.addInitScript(()=>{sessionStorage.setItem('paybypalm.terminalKey','fixture-key');});
 await context.route('**/*',async route=>{
  const req=route.request(),url=new URL(req.url()),path=url.pathname;
  if(path==='/palm-recognition.worker.js')return route.fulfill({contentType:'text/javascript',body:`self.onmessage=e=>{if(e.data.type==='init')self.postMessage({type:'ready'});else{e.data.bitmap.close();self.postMessage({type:'result',id:e.data.id,landmarks:[]});}};`});
  const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'Content-Type,X-Terminal-Key','Access-Control-Allow-Methods':'GET,POST,OPTIONS'};
  if(path==='/terminal/events')return route.fulfill({status:204,headers});
  const api=path==='/terminal/me'||path==='/health'||path.startsWith('/transactions')||path.startsWith('/enrol/');
  if(!api)return url.origin===origin?route.continue():route.abort();
  if(req.method()==='OPTIONS')return route.fulfill({status:204,headers});
  const body=req.postDataJSON();calls.push({path,body});let data;
  if(path==='/terminal/me')data={terminalId:'terminal',terminalLabel:'Counter 1',merchantName:'Test merchant',captureMode:'ccnet'};
  else if(path==='/health')data={status:'ok'};
  else if(path==='/enrol/sessions')data={sessionId:session,linkUrl:origin+'/scan/'+session,expiresAt:new Date(Date.now()+300000).toISOString(),captureMode:'ccnet'};
  else if(path===`/enrol/sessions/${session}`)data={sessionId:session,status:'claimed',userDisplayName:'Test U.'};
  else if(path.endsWith('/palm')){enrollAttempts++;assert.equal(body.imagesB64.length,3);assert.equal(new Set(body.imagesB64).size,3);if(enrollAttempts===1)return route.fulfill({status:422,headers,json:{error:{code:'palm_capture_rejected',message:'The three captures were inconsistent. Retake them.'}}});data={status:'completed',userDisplayName:'Test U.'};}
  else if(path==='/transactions')data={transactionId:txn,amountMinor:100,status:'pending'};
  else if(path.endsWith('/authenticate')){matches++;data=matches===1?{decision:'reject',message:'No confident match',reason:'low_score'}:{decision:'accept',score:91,mode:'search',maskedName:'Test U.',cardLast4:'4081',cardBrand:'visa',pinRequired:false};}
  else throw Error('Unexpected fixture '+path);
  return route.fulfill({json:data,headers});
 });
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto(origin+'/terminal');await page.getByRole('button',{name:'Enrol new user',exact:true}).click();await page.waitForFunction(()=>document.querySelector('video')?.readyState>=2);
 await page.getByRole('button',{name:'Capture',exact:true}).click();await page.getByRole('button',{name:'Retake',exact:true}).waitFor();await page.screenshot({path:out+'/enrollment-retake-800.png'});await page.getByRole('button',{name:'Retake',exact:true}).click();await page.getByText('Palm linked',{exact:true}).waitFor();
 assert.equal(calls.filter(c=>c.path==='/enrol/sessions').length,1);assert.equal(enrollAttempts,2);assert.notDeepEqual(calls.filter(c=>c.path.endsWith('/palm'))[0].body.imagesB64,calls.filter(c=>c.path.endsWith('/palm'))[1].body.imagesB64);
 await page.getByRole('button',{name:'Done',exact:true}).click();await page.getByRole('button',{name:'New sale',exact:true}).click();await page.getByRole('button',{name:'1',exact:true}).click();await page.getByRole('button',{name:'Charge',exact:true}).click();await page.waitForFunction(()=>document.querySelector('video')?.readyState>=2);
 await page.getByRole('button',{name:'Capture',exact:true}).click();await page.getByRole('button',{name:'Retake',exact:true}).waitFor();await page.screenshot({path:out+'/payment-retake-800.png'});await page.getByRole('button',{name:'Retake',exact:true}).click();await page.getByRole('button',{name:'Pay from card',exact:true}).waitFor();
 assert.equal(calls.filter(c=>c.path==='/transactions').length,1);assert.equal(calls.some(c=>c.path.endsWith('/cancel')||c.path.endsWith('/confirm')),false);assert.deepEqual(errors,[]);console.log('PASS: Pi 800×480 same-session enrollment retake and same-sale payment retake; three fresh frames; no charge. Fixtures only.');await context.close();
}finally{await browser.close();}
