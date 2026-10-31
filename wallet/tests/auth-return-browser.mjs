// Actual wallet UI with intercepted authentication/card APIs. Never charges a card.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || 'playwright');
const origin = process.env.PBP_PREVIEW_ORIGIN || 'http://127.0.0.1:5177';
const browser = await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE||undefined});
const artifacts = '/tmp/pbp-auth-return-check'; mkdirSync(artifacts,{recursive:true});
const key = 'paybypalm.identity.session';
const session = {accessToken:'fixture-access',refreshToken:'fixture-refresh'};
const reference = 'pbp_card_'+'a'.repeat(32);
const card = {id:'cccccccc-cccc-4ccc-8ccc-cccccccccccc',bank:'Fixture Bank',brand:'visa',last4:'5678',exp_month:'11',exp_year:'2098',is_default:true,is_paused:false,created_at:'2026-10-31T00:00:00Z'};
try {
 for (const width of [390,1280]) {
  const context = await browser.newContext({viewport:{width,height:900},reducedMotion:'reduce',serviceWorkers:'block'});
  let meStatus=200,refreshStatus=200,verifyStatus=200,cards=[],attempts=[],checks=0,logins=0,claims=0;
  const errors=[];
  await context.route('**/*',async route=>{
   const request=route.request(),url=new URL(request.url());
   if(url.origin===origin&&(request.isNavigationRequest()||!/^\/(me|cards|transactions|auth|enrol)(\/|$)/.test(url.pathname)))return route.continue();
   if(!/^\/(me|cards|transactions|auth|enrol)(\/|$)/.test(url.pathname))return route.abort();
   const headers={'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Headers':'Content-Type,Authorization','Access-Control-Allow-Methods':'GET,POST,OPTIONS','Cache-Control':'no-store'};
   if(request.method()==='OPTIONS')return route.fulfill({status:204,headers});
   const path=url.pathname;let status=200,data={};
   if(path==='/auth/login'){logins++;data={session};}
   else if(path==='/auth/logout')return route.fulfill({status:204,headers});
   else if(path==='/auth/refresh'){status=refreshStatus;data=status===200?{session}:{error:{code:'unauthorized',message:'Session expired'}};}
   else if(path==='/me'){status=meStatus;data=status===200?{id:'fixture-user',fullName:'Fixture User',email:'user@example.test',phone:'+2348123456789',hasPin:true,palmEnrolled:false,paymentMode:'test',currency:'NGN',createdAt:card.created_at}:{error:{code:'unavailable',message:'Account service unavailable'}};}
   else if(path==='/cards')data={enabled:true,paymentMode:'test',testMode:true,amountMinor:5000,currency:'NGN',cards,attempts};
   else if(path==='/cards/link/verify'){
    checks++;status=verifyStatus;
    assert.equal(request.postDataJSON().reference,reference);
    data=status===200?{reference,status:'verified',refundStatus:'pending',cardId:card.id,createdAt:card.created_at}:{error:{code:'verification_unavailable',message:'Please retry card verification.'}};
    if(status===200){cards=[{...card}];attempts=[data];}
   }else if(path==='/cards/'+card.id){card.is_paused=request.postDataJSON().action==='pause';cards=[{...card}];data={updated:true};}
   else if(path.endsWith('/claim')){claims++;data={sessionId:path.split('/')[3],status:'claimed',expiresAt:'2099-01-01T00:00:00Z'};}
   else if(path==='/transactions')data={transactions:[],total:0};
   await route.fulfill({status,headers,json:data});
  });
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  const saved=()=>page.evaluate(k=>localStorage.getItem(k),key);
  async function login(){
   await page.getByRole('heading',{name:'Welcome Back',exact:true}).waitFor();
   await page.getByLabel('Email address').fill('user@example.test');
   await page.getByLabel('Password',{exact:true}).fill('fixture-password');
   await page.getByRole('button',{name:'Sign In',exact:true}).click();
  }
  try {
   // A saved Profile destination must not override ordinary returning-user Home.
   await page.goto(origin+'/profile');await login();await page.waitForURL(origin+'/dashboard');
   assert.ok(await saved());assert.equal(logins,1);
   await page.goto(origin+'/login');await page.waitForURL(origin+'/dashboard');assert.equal(logins,1);

   // A card return must survive a temporary /me failure during app bootstrap.
   meStatus=503;await page.goto(origin+'/cards?reference='+reference);
   await page.getByRole('button',{name:'Retry account connection'}).waitFor();
   assert.ok(await saved());assert.ok(page.url().includes(reference));assert.equal(checks,0);
   await page.screenshot({path:`${artifacts}/account-retry-${width}.png`,fullPage:true});
   meStatus=200;await page.getByRole('button',{name:'Retry account connection'}).click();
   await page.getByText('Card linked. Your saved card is shown below.',{exact:true}).waitFor();
   await page.getByRole('heading',{name:'Fixture Bank'}).waitFor();
   assert.equal(new URL(page.url()).pathname,'/cards');assert.equal(new URL(page.url()).search,'');assert.equal(checks,1);assert.ok(await saved());

   // A background account outage leaves cards and the current route available.
   meStatus=503;await page.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));
   await page.getByRole('button',{name:'Retry account connection'}).waitFor();
   await page.getByRole('heading',{name:'Fixture Bank'}).waitFor();assert.ok(await saved());
   meStatus=200;await page.getByRole('button',{name:'Retry account connection'}).click();
   await page.getByRole('button',{name:'Retry account connection'}).waitFor({state:'detached'});
   await page.getByRole('button',{name:'Pause',exact:true}).click();await page.getByText('Card updated.',{exact:true}).waitFor();
   await page.getByRole('button',{name:'Resume',exact:true}).click();assert.equal(new URL(page.url()).pathname,'/cards');assert.ok(await saved());

   // Verification failures retain the reference and offer an explicit safe retry.
   verifyStatus=503;await page.goto(origin+'/cards?reference='+reference);
   await page.getByRole('button',{name:'Retry card verification'}).waitFor();assert.ok(page.url().includes(reference));assert.ok(await saved());
   verifyStatus=200;await page.getByRole('button',{name:'Retry card verification'}).click();
   await page.getByText('Card linked. Your saved card is shown below.',{exact:true}).waitFor();assert.equal(new URL(page.url()).search,'');
   await page.screenshot({path:`${artifacts}/cards-return-${width}.png`,fullPage:true});
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);

   // An unavailable refresh service is not proof that the session is invalid.
   meStatus=401;refreshStatus=503;await page.reload();
   await page.getByRole('button',{name:'Retry account connection'}).waitFor();assert.ok(await saved());
   meStatus=200;refreshStatus=200;await page.getByRole('button',{name:'Retry account connection'}).click();await page.getByRole('heading',{name:'Fixture Bank'}).waitFor();

   // Genuine expiry requires sign-in, preserving the card callback for afterwards.
   meStatus=401;refreshStatus=401;await page.goto(origin+'/cards?reference='+reference);
   await page.getByRole('heading',{name:'Welcome Back',exact:true}).waitFor();assert.equal(await saved(),null);
   meStatus=200;refreshStatus=200;await login();await page.waitForURL(origin+'/cards');await page.getByRole('heading',{name:'Fixture Bank'}).waitFor();

   // Explicit sign-out still works; signing back in opens Home, not Profile.
   await page.goto(origin+'/profile');await page.getByRole('button',{name:'Sign Out of PayByPalm'}).click();await page.getByRole('button',{name:'Yes, Sign Out'}).click();
   await page.getByRole('heading',{name:'Welcome Back',exact:true}).waitFor();assert.equal(await saved(),null);
   await login();await page.waitForURL(origin+'/dashboard');
   // Enrollment QR intent must survive sign-in too.
   await page.evaluate(k=>localStorage.removeItem(k),key);
   const scan='/scan/aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';await page.goto(origin+scan);await login();await page.waitForURL(origin+scan);
   await page.waitForFunction(()=>document.body.innerText.includes('terminal')||document.body.innerText.includes('Terminal'));
   assert.ok(claims>0);assert.deepEqual(errors,[]);
   console.log(`PASS ${width}px: returning login/Home, card callback bootstrap outage/retry, card edits, verification retry, genuine expiry, sign-out and QR intent. Fixtures only.`);
  }catch(error){await page.screenshot({path:`${artifacts}/failure-${width}.png`,fullPage:true}).catch(()=>{});throw error;}
  finally{await context.close();}
 }
}finally{await browser.close();}
