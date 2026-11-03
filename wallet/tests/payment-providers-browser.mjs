// Actual wallet UI, intercepted APIs and hosted checkout. Never contacts a payment provider.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdirSync} from 'node:fs';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE||'playwright');
const origin=process.env.PBP_PREVIEW_ORIGIN||'http://127.0.0.1:5177';
const browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE||undefined});
mkdirSync('/tmp/pbp-payment-providers',{recursive:true});
try{
 for(const width of [390,1280]){
  const context=await browser.newContext({viewport:{width,height:900},reducedMotion:'reduce',serviceWorkers:'block'});
  await context.addInitScript(()=>localStorage.setItem('paybypalm.identity.session',JSON.stringify({accessToken:'fixture',refreshToken:'fixture'})));
  let provider='paystack',cards=[],attempts=[],checks=0,links=0,badUrl=false;
  const ref='pbp_card_'+'a'.repeat(32),card={id:'cccccccc-cccc-4ccc-8ccc-cccccccccccc',bank:'Fixture Bank',brand:'visa',last4:'5678',exp_month:'12',exp_year:'2098',is_default:true,is_paused:false,created_at:'2026-11-01T00:00:00Z'};
  await context.route('**/*',async route=>{
   const request=route.request(),url=new URL(request.url());
   if(['checkout.flutterwave.com','checkout.paystack.com'].includes(url.hostname))return route.fulfill({contentType:'text/html',body:'<h1>Mock hosted checkout</h1>'});
   if(url.origin===origin&&(request.isNavigationRequest()||!/^\/(me|cards|transactions|auth)(\/|$)/.test(url.pathname)))return route.continue();
   if(!/^\/(me|cards|transactions|auth)(\/|$)/.test(url.pathname))return route.abort();
   const headers={'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Headers':'Content-Type,Authorization','Access-Control-Allow-Methods':'GET,POST,OPTIONS','Cache-Control':'no-store'};
   if(request.method()==='OPTIONS')return route.fulfill({status:204,headers});
   let data={};
   if(url.pathname==='/me')data={id:'fixture',fullName:'Fixture User',email:'fixture@example.test',hasPin:true,palmEnrolled:false,paymentMode:'test',paymentProvider:provider,currency:'NGN',createdAt:card.created_at};
   if(url.pathname==='/cards')data={provider,enabled:true,paymentMode:'test',amountMinor:provider==='flutterwave'?10000:5000,currency:'NGN',cards,attempts};
   if(url.pathname==='/cards/link/verify'){checks++;assert.equal(request.postDataJSON().reference,ref);cards=[card];data={reference:ref,provider:'flutterwave',amountMinor:10000,status:'verified',refundStatus:'pending',cardId:card.id};attempts=[data];}
   if(url.pathname==='/cards/link'){links++;assert.equal(request.postDataJSON().paymentProvider,provider);assert.equal(request.postDataJSON().paymentMode,'test');assert.equal(request.postDataJSON().consent,true);assert.equal(request.postDataJSON().amount,undefined);data={reference:ref,checkoutUrl:`https://checkout.${badUrl?'paystack':provider}.com/mock`};}
   await route.fulfill({headers,json:data});
  });
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(origin+'/cards');await page.getByRole('button',{name:/Continue to Paystack/}).waitFor();
  await page.getByRole('checkbox').check();provider='flutterwave';await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
  await page.getByRole('button',{name:/Continue to Flutterwave/}).waitFor();assert.equal(await page.getByRole('checkbox').isChecked(),false);assert.equal(await page.getByRole('button',{name:/Continue to Flutterwave/}).isDisabled(),true);
  assert.ok(await page.getByText(/₦100/).count());assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await page.screenshot({path:`/tmp/pbp-payment-providers/flutterwave-${width}.png`,fullPage:true});
  badUrl=true;await page.getByRole('checkbox').check();await page.getByRole('button',{name:/Continue to Flutterwave/}).click();await page.getByRole('alert').filter({hasText:'Invalid payment checkout URL.'}).waitFor();assert.equal(new URL(page.url()).origin,origin);
  badUrl=false;await page.getByRole('checkbox').check();await page.getByRole('button',{name:/Continue to Flutterwave/}).click();await page.waitForURL('https://checkout.flutterwave.com/mock');
  await page.goto(origin+'/cards?status=successful&tx_ref='+ref+'&transaction_id=123');await page.getByText('Card linked. Your saved card is shown below.',{exact:true}).waitFor();assert.equal(new URL(page.url()).search,'');assert.equal(checks,1);assert.equal(links,2);await page.getByRole('heading',{name:'Fixture Bank'}).waitFor();await page.getByText(/₦100 refund is being processed/).waitFor();
  assert.ok(await page.evaluate(()=>localStorage.getItem('paybypalm.identity.session')));assert.deepEqual(errors,[]);
  await context.close();
 }
 console.log('PASS: mobile/desktop provider switch resets consent, ₦100 notice, exact checkout origin, Flutterwave callback verification and retained session. Mock payments only.');
}finally{await browser.close();}
