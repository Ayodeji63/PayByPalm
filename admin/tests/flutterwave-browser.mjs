// Real Admin interface, mocked live-mode contracts only. No bank changes or payment requests.
import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
import {chromium} from 'playwright';
const origin=process.env.ADMIN_TEST_ORIGIN||'http://127.0.0.1:5190';
const browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE||undefined});
mkdirSync('/tmp/pbp-flutterwave-admin-live',{recursive:true});
try{
 for(const width of [390,1280]){
  const context=await browser.newContext({viewport:{width,height:1000},reducedMotion:'reduce'});
  const id='dddddddd-dddd-4ddd-8ddd-dddddddddddd',stamp='2026-11-01T00:00:00Z';
  let merchant={id,name:'Fixture Stores',contact_email:'fixture@example.test',contact_phone:'+2348012345678',address:null,paystack_subaccount:'ACCT_retained',created_at:stamp,updated_at:stamp},code=null,setup=null,creates=0,checks=0;
  await context.route('**/api/**',async route=>{
   const req=route.request(),path=new URL(req.url()).pathname;let data={},status=200;
   if(path==='/api/auth/session')data={user:{id:'fixture',email:'admin@example.test'}};
   else if(path==='/api/overview')data={merchants:[merchant],terminals:[],activity:[],terminalUrl:'https://wallet.example.test/terminal',fixture:true};
   else if(path.endsWith('/access'))data={members:[]};
   else if(path==='/api/payouts/banks')data={provider:'flutterwave',mode:'live',banks:[{code:'044',name:'Fixture Bank'}]};
   else if(path==='/api/payouts/verify'){
    assert.deepEqual(req.postDataJSON(),{merchantId:id,bankCode:'044',accountNumber:'0123456789'});
    data={provider:'flutterwave',mode:'live',accountName:'FIXTURE STORES',bankName:'Fixture Bank',accountLast4:'6789',verificationToken:'opaque-fixture-token',expiresAt:new Date(Date.now()+300000).toISOString()};
   }else if(path.endsWith('/payout')&&req.method()==='GET')data={provider:'flutterwave',mode:'live',enabled:true,setup,subaccountCode:code};
   else if(path.endsWith('/payout')&&req.method()==='POST'){
    assert.deepEqual(req.postDataJSON(),{verificationToken:'opaque-fixture-token',percentageCharge:0,expected:stamp});creates++;
    setup={provider:'flutterwave',mode:'live',status:'needs_review',bankName:'Fixture Bank',accountName:'FIXTURE STORES',accountLast4:'6789',percentageCharge:0,subaccountCode:null,verified:null,active:null};
    status=502;data={error:{code:'flutterwave_unavailable',message:'Flutterwave could not confirm this request. Check its status before creating another subaccount.'}};
   }else if(path.endsWith('/payout/check')){
    checks++;code='RS_fixture';setup={...setup,status:'created',subaccountCode:code};merchant={...merchant,updated_at:new Date().toISOString()};data={merchant,setup};
   }else throw Error('Unexpected API request '+path);
   await route.fulfill({status,json:data});
  });
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(origin+'/#/merchants/'+id);
  const section=page.locator('section').filter({has:page.getByRole('heading',{name:'Bank payouts',exact:true})});
  await section.getByText('Live mode',{exact:true}).waitFor();
  await page.getByLabel('Settlement bank').selectOption('044');await page.getByLabel('Account number',{exact:true}).fill('0123456789');await page.getByRole('button',{name:'Verify bank account',exact:true}).click();
  await page.getByText('Account name confirmed',{exact:true}).waitFor();await page.getByText('FIXTURE STORES',{exact:true}).waitFor();
  const create=page.getByRole('button',{name:'Confirm and create payout account',exact:true});assert.equal(await create.isDisabled(),true);
  await section.getByRole('checkbox').check();assert.equal(await create.isDisabled(),false);
  await page.screenshot({path:`/tmp/pbp-flutterwave-admin-live/confirmed-bank-${width}.png`,fullPage:true});
  await create.click();await page.getByRole('button',{name:'Check status',exact:true}).waitFor();assert.equal(creates,1);assert.equal(await create.count(),0);
  await page.getByRole('button',{name:'Check status',exact:true}).click();await page.getByText('RS_fixture',{exact:true}).waitFor();
  assert.equal(creates,1);assert.equal(checks,1);assert.equal(merchant.paystack_subaccount,'ACCT_retained');
  await section.getByText(/This confirms setup, not a completed bank settlement/).waitFor();
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);assert.deepEqual(errors,[]);
  await page.screenshot({path:`/tmp/pbp-flutterwave-admin-live/recipient-${width}.png`,fullPage:true});await context.close();
 }
 console.log('PASS: mobile/desktop live-mode bank-name verification, explicit commission consent, uncertain creation recovery, no duplicate POST, masked recipient and retained Paystack setup. APIs mocked.');
}finally{await browser.close();}
