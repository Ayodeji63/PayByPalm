// Real admin UI, fake APIs only. No bank changes or payment requests.
import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
import {chromium} from 'playwright';
const origin=process.env.ADMIN_TEST_ORIGIN||'http://127.0.0.1:5190';
const browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE||undefined});
mkdirSync('/tmp/pbp-flutterwave-admin',{recursive:true});
try{
 for(const width of [390,1280]){
  const context=await browser.newContext({viewport:{width,height:1000},reducedMotion:'reduce'});
  const id='dddddddd-dddd-4ddd-8ddd-dddddddddddd',stamp='2026-11-01T00:00:00Z';
  let merchant={id,name:'Fixture Stores',contact_email:'fixture@example.test',contact_phone:null,address:null,paystack_subaccount:'ACCT_retained',created_at:stamp,updated_at:stamp},code=null,saves=0;
  await context.route('**/api/**',async route=>{
   const req=route.request(),path=new URL(req.url()).pathname;let data={};
   if(path==='/api/auth/session')data={user:{id:'fixture',email:'admin@example.test'}};
   else if(path==='/api/overview')data={merchants:[merchant],terminals:[],activity:[],terminalUrl:'https://wallet.example.test/terminal',fixture:true};
   else if(path.endsWith('/access'))data={members:[]};
   else if(path.endsWith('/payout'))data={provider:'flutterwave',mode:'test',enabled:false,setup:null,subaccountCode:code};
   else if(path.endsWith('/payout/flutterwave')){assert.deepEqual(req.postDataJSON(),{mode:'test',code:'RS_fixture',expected:stamp});code='RS_fixture';saves++;merchant={...merchant,updated_at:new Date().toISOString()};data={merchant};}
   else throw Error('Unexpected API request '+path);
   await route.fulfill({json:data});
  });
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(origin+'/#/merchants/'+id);
  await page.getByRole('heading',{name:'Flutterwave bank payouts · test'}).waitFor();
  await page.getByLabel('Test subaccount code').fill('RS_fixture');await page.getByRole('button',{name:'Save Flutterwave subaccount'}).click();
  await page.getByText('Saved subaccount:',{exact:false}).waitFor();assert.equal(saves,1);assert.equal(merchant.paystack_subaccount,'ACCT_retained');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);assert.deepEqual(errors,[]);
  await page.screenshot({path:`/tmp/pbp-flutterwave-admin/recipient-${width}.png`,fullPage:true});await context.close();
 }
 console.log('PASS: Flutterwave merchant recipient save on mobile and desktop; Paystack recipient retained. Mock APIs only.');
}finally{await browser.close();}
