// Fixture SDK/API only: no camera, real palm, Tencent request or card charge.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdirSync} from 'node:fs';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE||chromium.executablePath()});
const origin=process.env.PBP_PREVIEW_ORIGIN || 'http://127.0.0.1:4186';
const artifacts='/tmp/paybypalm-h5-browser';mkdirSync(artifacts,{recursive:true});
const txn='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const enrol='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const capture='dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const image={Data:'fixture-ciphertext',DataDigest:'a'.repeat(32),ImageType:'RGB'};
const payload=JSON.stringify({RgbImage:image,LivenessRgbImage:image,UserToken:'sut_fixture',SdkVersion:'1.3.0',SdkTimestamps:'{}',VideoPath:'NO_VIDEO_UPLOAD'});
try {
 for(const viewport of [{width:800,height:480},{width:390,height:844}]) {
  const context=await browser.newContext({viewport});
  const calls=[],errors=[];
  await context.addInitScript(({payload})=>{
   sessionStorage.setItem('paybypalm.terminalKey','fixture-device-key');
   window.__sdkFailure=true;window.__sdkCalls=[];window.__sdkLightChecks=[];window.__ledStates=[];
   const enableBridge=()=>{document.documentElement.dataset.paybypalmLedBridge='1';};
   if(document.documentElement)enableBridge();else document.addEventListener('DOMContentLoaded',enableBridge,{once:true});
   window.addEventListener('message',event=>{
    if(event.source!==window||event.data?.type!=='pbp-led-request')return;
    window.__ledStates.push(event.data.state);
    window.postMessage({...event.data,type:'pbp-led-response',available:true,mock:true},location.origin);
   });
   window.PalmMobileManager={PalmMobileManager:{start:async params=>{
    window.__sdkCalls.push(params);
    await new Promise(resolve=>setTimeout(resolve,100));
    window.__sdkLightChecks.push(window.__ledStates.at(-1));
    return window.__sdkFailure?{code:10003,message:'private-provider-diagnostic'}:{code:0,data:{payload}};
   },back:()=>{}}};
  },{payload});
  await context.route('**/*',async route=>{
   const req=route.request(),url=new URL(req.url()),path=url.pathname;
   const api=path==='/terminal/me'||path==='/health'||path==='/me'||path.startsWith('/transactions')||path.startsWith('/enrol/');
   if(!api) {
    if(url.origin===origin)return route.continue();
    return route.abort();
   }
   const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'Content-Type,X-Terminal-Key','Access-Control-Allow-Methods':'GET,POST,OPTIONS','Cache-Control':'no-store'};
   if(req.method()==='OPTIONS')return route.fulfill({status:204,headers});
   calls.push({path,method:req.method(),body:req.postDataJSON()});
   let data;
   if(path==='/terminal/me')data={terminalId:'terminal',terminalLabel:'Test counter',merchantName:'Test merchant'};
   else if(path==='/me')data={id:'fixture-user',fullName:'Test User',email:'pilot@example.test',phone:'+2348012345678',hasPin:true,palmEnrolled:false,balanceMinor:null,cardBalanceAvailable:false,paymentSource:'linked_card'};
   else if(path==='/health')data={status:'ok'};
   else if(path.endsWith('/palm-capture'))data={captureMode:'h5',captureId:capture,userId:'fixture-user',token:'sut_fixture',expiresAt:new Date(Date.now()+90000).toISOString(),loaderUrl:'https://open.palmoa.youtu.qq.com/palm/x/jssdk/loader/palm-mobile-manager.js'};
   else if(path==='/transactions')data={transactionId:txn,amountMinor:100,status:'pending'};
   else if(path.endsWith('/authenticate'))data={decision:'accept',mode:'compare',score:95,maskedName:'Test U.',cardLast4:'4081',cardBrand:'visa',pinRequired:false};
   else if(path.endsWith('/confirm'))data={transactionId:txn,amountMinor:100,settledAt:new Date().toISOString(),maskedName:'Test U.',merchantName:'Test merchant',terminalLabel:'Test counter'};
   else if(path==='/enrol/sessions')data={sessionId:enrol,linkUrl:origin+'/scan/'+enrol,expiresAt:new Date(Date.now()+90000).toISOString(),captureMode:'h5'};
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
  await page.getByRole('alert').filter({hasText:'SDK 10003'}).waitFor();
  assert.equal(await page.getByText('private-provider-diagnostic').count(),0);
  assert.equal(calls.some(c=>c.path.endsWith('/authenticate')),false);
  await page.screenshot({path:`${artifacts}/camera-error-${viewport.width}.png`});
  await page.evaluate(()=>{window.__sdkFailure=false;});
  await page.getByRole('button',{name:'Try another scan',exact:true}).click();
  await page.getByRole('button',{name:'Pay from card',exact:true}).waitFor();
  const auth=calls.find(c=>c.path.endsWith('/authenticate'));
  assert.deepEqual(auth.body,{captureId:capture,payload});
  assert.equal(calls.some(c=>c.path.endsWith('/confirm')),false,'capture cannot charge a card');
  assert.ok((await page.evaluate(()=>window.__sdkLightChecks)).every(state=>state==='CAPTURING'),'payment capture must retain white camera illumination');
  await page.screenshot({path:`${artifacts}/payment-confirm-${viewport.width}.png`});
  await page.getByRole('button',{name:'Pay from card',exact:true}).click();
  await page.getByText('Payment complete',{exact:true}).waitFor();
  await page.reload();
  await page.evaluate(()=>{window.__sdkFailure=false;});
  await page.getByRole('button',{name:'Enrol new user',exact:true}).click();
  await page.getByText('Palm linked',{exact:true}).waitFor();
  assert.deepEqual(calls.find(c=>c.path.endsWith('/palm')).body,{captureId:capture,payload});
  const sdkCalls=await page.evaluate(()=>window.__sdkCalls);
  assert.equal(sdkCalls.at(-1).mode,'registration');
  assert.ok(sdkCalls.every(c=>c.enableImageOnly===true&&c.enableManager===false));
  assert.ok((await page.evaluate(()=>window.__sdkLightChecks)).every(state=>state==='CAPTURING'),'H5 acquisition must retain white camera illumination');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  assert.deepEqual(errors,[]);
  await page.screenshot({path:`${artifacts}/enrol-linked-${viewport.width}.png`});
  await page.evaluate(()=>localStorage.setItem('paybypalm.session',JSON.stringify({accessToken:'fixture-access',refreshToken:'fixture-refresh'})));
  await page.goto(origin+'/consent');
  await page.getByRole('heading',{name:'Before You Link Your Palm'}).waitFor();
  assert.equal(await page.getByText(/AES-256|bank-grade|NDPA.*compliance/).count(),0);
  await page.getByText(/Tencent also receives session diagnostics/).waitFor();
  await page.screenshot({path:`${artifacts}/consent-${viewport.width}.png`,fullPage:true});
  await context.close();
 }
 console.log('PASS: Pi/mobile capture errors, retry, server submission, explicit payment confirmation and SDK enrolment. Fixtures only. Screenshots: '+artifacts);
} finally {await browser.close();}
