// All backend responses are fixtures. Never contacts a payment provider.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdirSync} from 'node:fs';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE||'playwright');
const origin=process.env.PBP_PREVIEW_ORIGIN||'http://127.0.0.1:5187';
const out='/tmp/paybypalm-payment-recovery';mkdirSync(out,{recursive:true});
const txn='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const sale={saleId:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',transactionId:txn,amountMinor:10000,confirming:true};
const browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE});
try {
 for(const viewport of [{width:800,height:480},{width:1280,height:720}]) {
  const context=await browser.newContext({viewport,hasTouch:true});
  const calls=[],errors=[];let status='processing';
  await context.addInitScript(sale=>{
   sessionStorage.setItem('paybypalm.terminalKey','fixture-device-key');
   if(!sessionStorage.getItem('fixture-initialized')){
    sessionStorage.setItem('paybypalm.pendingSale',JSON.stringify(sale));
    sessionStorage.setItem('fixture-initialized','1');
   }
  },sale);
  await context.route('**/*',async route=>{
   const req=route.request(),url=new URL(req.url()),path=url.pathname;
   const api=path==='/health'||path.startsWith('/terminal/')||path.startsWith('/transactions');
   if(!api)return url.origin===origin?route.continue():route.abort();
   const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'Content-Type,X-Terminal-Key','Access-Control-Allow-Methods':'GET,POST,OPTIONS'};
   if(req.method()==='OPTIONS')return route.fulfill({status:204,headers});
   calls.push({path,method:req.method()});
   if(path==='/terminal/events')return route.fulfill({status:204,headers});
   if(path==='/health')return route.fulfill({headers,json:{status:'ok'}});
   if(path==='/terminal/me')return route.fulfill({headers,json:{merchantName:'Test merchant',terminalLabel:'Counter 1',captureMode:'legacy'}});
   if(path===`/terminal/transactions/${txn}`)return route.fulfill({headers,json:{transactionId:txn,status,amountMinor:10000}});
   if(path===`/transactions/${txn}/cancel`||path===`/transactions/${txn}/confirm`)return route.fulfill({status:409,headers,json:{error:{code:'card_payment_pending',message:'The card payment is being checked. Do not start another sale.',},requestId:'1db59ff7-e87b-4e54-a2f6-9db25253264b'}});
   throw Error('Unexpected API call '+path);
  });
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  await page.goto(origin+'/terminal');
  await page.getByRole('button',{name:'Cancel pending sale',exact:true}).click();
  await page.getByRole('alert').waitFor();
  await page.screenshot({path:`${out}/recovery-${viewport.width}.png`});
  const before=calls.filter(c=>c.path.startsWith('/transactions')||c.path.startsWith('/terminal/transactions')).length;
  await page.getByRole('button',{name:'Back to home',exact:true}).click();
  await page.getByRole('button',{name:'Check payment',exact:true}).waitFor();
  assert.equal(await page.getByRole('button',{name:'New sale',exact:true}).count(),0);
  await page.getByRole('button',{name:'Enrol new user',exact:true}).waitFor();
  assert.deepEqual(await page.evaluate(()=>JSON.parse(sessionStorage.getItem('paybypalm.pendingSale'))),sale);
  assert.equal(calls.filter(c=>c.path.startsWith('/transactions')||c.path.startsWith('/terminal/transactions')).length,before,'dismissal makes no payment requests');
  await page.screenshot({path:`${out}/home-${viewport.width}.png`});
  for(const button of await page.getByRole('button').all()){
   const box=await button.boundingBox();assert.ok(box&&box.y>=0&&box.y+box.height<=viewport.height+1,'home buttons fit the Pi screen');
  }
  await page.getByRole('button',{name:'Check payment',exact:true}).click();
  await page.getByText('Resolve the previous payment',{exact:true}).waitFor();
  await page.getByRole('button',{name:'Back to home',exact:true}).click();
  await page.reload();
  await page.getByText('Resolve the previous payment',{exact:true}).waitFor();
  assert.deepEqual(await page.evaluate(()=>JSON.parse(sessionStorage.getItem('paybypalm.pendingSale'))),sale,'reload retains unresolved reference');
  status='failed';
  await page.getByRole('button',{name:'Check or retry this payment',exact:true}).click();
  await page.getByText('Payment not completed',{exact:true}).waitFor();
  assert.equal(await page.evaluate(()=>sessionStorage.getItem('paybypalm.pendingSale')),null);
  await page.getByRole('button',{name:/Done/}).click();
  await page.getByRole('button',{name:'New sale',exact:true}).waitFor();
  assert.equal(calls.some(c=>c.path==='/transactions'||c.path.endsWith('/confirm')),false,'no new sale or charge while navigating');
  assert.deepEqual(errors,[]);
  console.log(`PASS ${viewport.width}x${viewport.height}: dismiss, reopen, reload, preserve pending sale and unlock new sales only after a final outcome.`);
  await context.close();
 }
} finally {await browser.close();}
