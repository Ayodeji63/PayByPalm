// Synthetic camera and API fixtures only; no real biometrics or payment calls.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdirSync} from 'node:fs';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE||'playwright');
const origin=process.env.PBP_PREVIEW_ORIGIN||'http://127.0.0.1:5177',out='/tmp/paybypalm-retake-browser';mkdirSync(out,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,args:['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream']});
const session='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',txn='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
try{
 const context=await browser.newContext({viewport:{width:800,height:480},permissions:['camera'],hasTouch:true});const errors=[],calls=[];let enrollAttempts=0,matches=0,confirmations=0,paymentState='pending',scenario='pending_then_success';
 await context.addInitScript(()=>{sessionStorage.setItem('paybypalm.terminalKey','fixture-key');
  window.__audioLog=[];window.Audio=class {src='';muted=false;preload='';currentTime=0;onended=null;onerror=null;timer=null;
   pause(){clearTimeout(this.timer);}
   play(){window.__audioLog.push(this.src);clearTimeout(this.timer);this.timer=setTimeout(()=>this.onended?.(),100);return Promise.resolve();}
  };});
 await context.route('**/*',async route=>{
  const req=route.request(),url=new URL(req.url()),path=url.pathname;
  if(path==='/palm-recognition.worker.js')return route.fulfill({contentType:'text/javascript',body:`self.onmessage=e=>{if(e.data.type==='init')self.postMessage({type:'ready'});else{e.data.bitmap.close();self.postMessage({type:'result',id:e.data.id,landmarks:[]});}};`});
  const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'Content-Type,X-Terminal-Key','Access-Control-Allow-Methods':'GET,POST,OPTIONS'};
  if(path==='/terminal/events')return route.fulfill({status:204,headers});
  const api=path==='/terminal/me'||path.startsWith('/terminal/transactions/')||path==='/health'||path.startsWith('/transactions')||path.startsWith('/enrol/');
  if(!api)return url.origin===origin?route.continue():route.abort();
  if(req.method()==='OPTIONS')return route.fulfill({status:204,headers});
  const body=req.postDataJSON();calls.push({path,body});let data;
  if(path==='/terminal/me')data={terminalId:'terminal',terminalLabel:'Counter 1',merchantName:'Test merchant',captureMode:'ccnet'};
  else if(path==='/health')data={status:'ok'};
  else if(path==='/enrol/sessions')data={sessionId:session,linkUrl:origin+'/scan/'+session,expiresAt:new Date(Date.now()+300000).toISOString(),captureMode:'ccnet'};
  else if(path===`/enrol/sessions/${session}`)data={sessionId:session,status:'claimed',userDisplayName:'Test U.'};
  else if(path.endsWith('/palm')){enrollAttempts++;assert.equal(body.imagesB64.length,3);assert.equal(new Set(body.imagesB64).size,3);if(enrollAttempts===1)return route.fulfill({status:422,headers,json:{error:{code:'palm_capture_rejected',message:'The three captures were inconsistent. Retake them.'}}});data={status:'completed',userDisplayName:'Test U.'};}
  else if(path==='/transactions'){paymentState='pending';data={transactionId:txn,amountMinor:100,status:'pending'};}
  else if(path.startsWith('/terminal/transactions/'))data={transactionId:txn,amountMinor:100,status:paymentState};
  else if(path.endsWith('/cancel')){paymentState='cancelled';data={transactionId:txn,status:'cancelled'};}
  else if(path.endsWith('/confirm')){confirmations++;if(scenario==='failed'){paymentState='failed';return route.fulfill({status:402,headers,json:{error:{code:'card_declined',message:'Fixture card declined'}}});}if(confirmations===1){paymentState='processing';return route.fulfill({status:503,headers,json:{error:{code:'card_payment_pending',message:'Fixture payment pending'}}});}paymentState='settled';data={transactionId:txn,amountMinor:100,settledAt:new Date().toISOString(),maskedName:'Test U.',merchantName:'Test merchant'};}
  else if(path.endsWith('/authenticate')){matches++;paymentState=matches===1?'pending':'authenticated';data=matches===1?{decision:'reject',message:'No confident match',reason:'low_score'}:{decision:'accept',score:91,mode:'search',maskedName:'Test U.',cardLast4:'4081',cardBrand:'visa',pinRequired:false};}
  else throw Error('Unexpected fixture '+path);
  return route.fulfill({json:data,headers});
 });
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto(origin+'/terminal');await page.getByRole('button',{name:'Enrol new user',exact:true}).click();await page.waitForFunction(()=>document.querySelector('video')?.readyState>=2);
 await page.getByRole('button',{name:'Capture',exact:true}).click();await page.getByRole('button',{name:'Retake',exact:true}).waitFor();await page.screenshot({path:out+'/enrollment-retake-800.png'});await page.getByRole('button',{name:'Retake',exact:true}).click();await page.getByText('Palm linked',{exact:true}).waitFor();
 assert.equal(calls.filter(c=>c.path==='/enrol/sessions').length,1);assert.equal(enrollAttempts,2);assert.notDeepEqual(calls.filter(c=>c.path.endsWith('/palm'))[0].body.imagesB64,calls.filter(c=>c.path.endsWith('/palm'))[1].body.imagesB64);
 await page.getByRole('button',{name:'Done',exact:true}).click();await page.getByRole('button',{name:'New sale',exact:true}).click();await page.getByRole('button',{name:'1',exact:true}).click();await page.getByRole('button',{name:'Charge',exact:true}).click();await page.waitForFunction(()=>document.querySelector('video')?.readyState>=2);
 await page.getByRole('button',{name:'Capture',exact:true}).click();await page.getByRole('button',{name:'Retake',exact:true}).waitFor();await page.screenshot({path:out+'/payment-retake-800.png'});await page.getByRole('button',{name:'Retake',exact:true}).click();await page.getByRole('button',{name:'Pay from card',exact:true}).waitFor();
 assert.equal(calls.filter(c=>c.path==='/transactions').length,1);assert.equal(calls.some(c=>c.path.endsWith('/cancel')||c.path.endsWith('/confirm')),false);
 const sounds=()=>page.evaluate(()=>window.__audioLog.filter(path=>path.startsWith('/audio/')));
 let audio=await sounds();assert.ok(audio.some(path=>path.endsWith('retry_scan.wav')));assert.ok(audio.some(path=>path.endsWith('scan_complete.wav')));assert.equal(audio.some(path=>path.endsWith('success1.wav')),false,'enrollment and palm acceptance must never announce payment success');
 await page.getByRole('button',{name:'Cancel',exact:true}).click();await page.getByRole('button',{name:'New sale',exact:true}).waitFor();audio=await sounds();assert.ok(audio.some(path=>path.endsWith('cancelled.wav')));assert.equal(audio.some(path=>path.endsWith('success1.wav')),false);
 await page.screenshot({path:out+'/audio-idle-800.png'});
 async function readyToPay(){await page.getByRole('button',{name:'New sale',exact:true}).click();await page.getByRole('button',{name:'1',exact:true}).click();await page.getByRole('button',{name:'Charge',exact:true}).click();await page.waitForFunction(()=>document.querySelector('video')?.readyState>=2);await page.getByRole('button',{name:'Capture',exact:true}).click();await page.getByRole('button',{name:'Pay from card',exact:true}).waitFor();}
 await readyToPay();await page.getByRole('button',{name:'Pay from card',exact:true}).click();await page.getByText('Resolve the previous payment',{exact:true}).waitFor();
 audio=await sounds();assert.ok(audio.some(path=>path.endsWith('payment_pending.wav')));assert.equal(audio.some(path=>path.endsWith('payment_failed.wav')||path.endsWith('success1.wav')),false);
 await page.getByRole('button',{name:'Check or retry this payment',exact:true}).click();await page.getByText('Payment complete',{exact:true}).waitFor();audio=await sounds();assert.equal(audio.filter(path=>path.endsWith('success1.wav')).length,1);
 await page.screenshot({path:out+'/audio-success-800.png'});await page.getByRole('button',{name:/Done/}).click();
 scenario='failed';await readyToPay();await page.getByRole('button',{name:'Pay from card',exact:true}).click();await page.getByText('Resolve the previous payment',{exact:true}).waitFor();await page.getByRole('button',{name:'Check or retry this payment',exact:true}).click();await page.getByText('Payment not completed',{exact:true}).waitFor();
 audio=await sounds();assert.ok(audio.some(path=>path.endsWith('payment_failed.wav')));assert.equal(audio.filter(path=>path.endsWith('success1.wav')).length,1);assert.deepEqual(errors,[]);
 console.log('PASS: Pi 800×480 three-frame retakes, scan versus payment audio, cancelled/pending/failed separation and success1 exactly once after a verified fixture receipt. No live charge.');await context.close();
}finally{await browser.close();}
