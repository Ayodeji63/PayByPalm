// Browser boundary test. Auth calls are intercepted; no live accounts or emails.
import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
import {chromium} from 'playwright';
const origin=new URL(process.env.WALLET_TEST_ORIGIN||'http://127.0.0.1:5189').origin;
const artifacts=new URL('../test-results/auth/',import.meta.url).pathname;
mkdirSync(artifacts,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE||undefined});
try {
 for(const viewport of [{width:1440,height:1000},{width:390,height:844}]) {
  const context=await browser.newContext({viewport});
  const calls=[];let resetAttempts=0;
  await context.route('**/*',async route=>{
   const request=route.request(),url=new URL(request.url());
   if(request.isNavigationRequest()||!url.pathname.startsWith('/auth/')||url.origin===origin)return route.continue();
   const headers={'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Headers':'Content-Type,Authorization','Access-Control-Allow-Methods':'GET,POST,OPTIONS','Content-Type':'application/json'};
   if(request.method()==='OPTIONS')return route.fulfill({status:204,headers});
   calls.push({path:url.pathname,body:request.postDataJSON()});
   if(url.pathname==='/auth/reset-password'&&resetAttempts++===0)return route.fulfill({status:503,headers,body:JSON.stringify({error:{code:'auth_unavailable',message:'Authentication is temporarily unavailable. Please try again.'}})});
   return route.fulfill({status:200,headers,body:JSON.stringify(url.pathname==='/auth/confirm'?{verified:true}:url.pathname==='/auth/reset-password'?{reset:true}:{sent:true})});
  });
  const page=await context.newPage();
  page.on('pageerror',error=>console.error('Fixture page error:',error.message));
  await page.goto(origin+'/auth/confirm#token=test-verification-token');
  await page.getByRole('button',{name:'Verify email',exact:true}).waitFor();
  assert.equal(new URL(page.url()).hash,'');assert.equal(calls.length,0);
  await page.screenshot({path:artifacts+`verify-${viewport.width}.png`,fullPage:true});
  await page.getByRole('button',{name:'Verify email',exact:true}).click();
  await page.getByRole('heading',{name:'Email verified',exact:true}).waitFor();
  assert.deepEqual(calls.pop(),{path:'/auth/confirm',body:{token:'test-verification-token'}});
  assert.equal(await page.evaluate(()=>localStorage.getItem('paybypalm.identity.session')),null);
  await page.goto(origin+'/auth/reset#token=test-recovery-token');
  await page.getByLabel('New password',{exact:true}).fill('replacement-password');
  await page.getByLabel('Confirm password',{exact:true}).fill('different-password');
  await page.getByRole('button',{name:'Update password',exact:true}).click();
  await page.getByRole('alert').filter({hasText:'Your passwords must match.'}).waitFor();assert.equal(calls.length,0);
  await page.getByLabel('Confirm password',{exact:true}).fill('replacement-password');
  await page.getByRole('button',{name:'Update password',exact:true}).click();
  await page.getByRole('alert').filter({hasText:'Authentication is temporarily unavailable'}).waitFor();
  assert.equal(await page.getByLabel('New password',{exact:true}).inputValue(),'replacement-password');
  assert.equal(new URL(page.url()).hash,'');
  await page.screenshot({path:artifacts+`reset-retry-${viewport.width}.png`,fullPage:true});
  await page.getByRole('button',{name:'Update password',exact:true}).click();
  await page.getByRole('heading',{name:'Password updated',exact:true}).waitFor();
  for(const call of calls)assert.deepEqual(call.body,{token:'test-recovery-token',password:'replacement-password'});calls.length=0;
  await page.goto(origin+'/auth/forgot');
  await page.getByLabel('Email address',{exact:true}).fill('customer@example.com');
  await page.getByRole('button',{name:'Send reset link',exact:true}).click();
  await page.getByRole('heading',{name:'Check your email',exact:true}).waitFor();
  assert.deepEqual(calls.pop(),{path:'/auth/request-password-reset',body:{email:'customer@example.com'}});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await context.close();
 }
 console.log('PASS: desktop/mobile verification, explicit action, URL token scrubbing, no auto-login, recovery validation, retry, input preservation and generic email response. No live services contacted.');
} finally {await browser.close();}
