// Fixture integration: actual wallet UI; no real accounts, card data or charges.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
const { chromium }=createRequire(import.meta.url)('playwright');
const origin=process.env.PBP_PREVIEW_ORIGIN||'http://127.0.0.1:4178';
const browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE||undefined});
const context=await browser.newContext({viewport:{width:390,height:844}});
const artifacts='/tmp/pbp-card-link-check';mkdirSync(artifacts,{recursive:true});
const reference='pbp_card_'+'a'.repeat(32);
let cards=[],attempts=[],everLinked=false,refundStatus='pending',initializations=0,checks=0,failReads=false,enabled=true;
const card={id:'cccccccc-cccc-4ccc-8ccc-cccccccccccc',bank:'Actual Test Bank',brand:'visa',last4:'5678',exp_month:'11',exp_year:'2098',is_default:true,is_paused:false,created_at:'2026-10-18T00:00:00Z'};
await context.addInitScript(()=>{
 localStorage.setItem('paybypalm.session',JSON.stringify({accessToken:'fixture-token',refreshToken:'fixture-refresh'}));
 localStorage.setItem('paybypalm.tokenized_cards',JSON.stringify([{last4:'9999',balanceMinor:25000000}]));
});
await context.route('http://localhost:8080/**',async route=>{
 const path=new URL(route.request().url()).pathname;
 const body=route.request().postDataJSON();let data,status=200;
 if(path==='/me')data={id:'fixture-user',fullName:'Test User',email:'user@example.test',phone:'08010001234',hasPin:true,palmEnrolled:false,balanceMinor:9876543,currency:'NGN',createdAt:'2026-10-18T00:00:00Z'};
 else if(path==='/cards'&&failReads){status=503;data={error:{code:'unavailable',message:'Card storage unavailable'}};}
 else if(path==='/cards')data={enabled,testMode:true,amountMinor:5000,currency:'NGN',cards,attempts};
 else if(path==='/cards/link'){
  assert.deepEqual(Object.keys(body).sort(),['consent','requestId']);assert.equal(body.consent,true);assert.match(body.requestId,/^[a-f0-9-]{36}$/);
  initializations++;data={checkoutUrl:'https://checkout.paystack.com/pbp-fixture',reference};
 }else if(path==='/cards/link/verify'){
  assert.equal(body.reference,reference);checks++;
  if(!everLinked){cards=[{...card}];everLinked=true;}
  attempts=[{reference,status:'verified',refundStatus,cardId:card.id,createdAt:card.created_at}];
  data=attempts[0];
 }else if(path==='/cards/'+card.id){
  if(body.action==='pause')cards[0].is_paused=true;
  if(body.action==='resume')cards[0].is_paused=false;
  if(body.action==='remove')cards=[];
  data={updated:true};
 }else data={transactions:[]};
 await route.fulfill({status,json:data,headers:{'Cache-Control':'no-store','Access-Control-Allow-Origin':'*'}});
});
await context.route('https://checkout.paystack.com/**',route=>route.fulfill({contentType:'text/html',body:`<h1>Fixture secure checkout</h1><a href="${origin}/cards?reference=${reference}">Complete fixture verification</a>`}));
const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
try{
 await page.goto(origin+'/cards');
 await page.getByRole('heading',{name:'Your saved cards'}).waitFor();
 await page.getByText('You haven’t linked a card yet.').waitFor();
 const start=page.getByRole('button',{name:'Continue to Paystack · ₦50'});
 assert.equal(await start.isDisabled(),true);
 assert.equal(await page.locator('input').count(),1); // Consent only: card data belongs to hosted checkout.
 assert.equal((await page.locator('main').innerText()).includes('250,000'),false);
 await page.getByRole('checkbox').check();
 await page.screenshot({path:artifacts+'/empty-mobile.png',fullPage:true});
 await start.click();await page.waitForURL('https://checkout.paystack.com/**');
 await page.getByRole('link',{name:'Complete fixture verification'}).click();
 await page.getByRole('heading',{name:'Actual Test Bank'}).waitFor();
 await page.getByText('visa ···· 5678',{exact:true}).waitFor();
 await page.getByText('Expires 11/2098',{exact:true}).waitFor();
 await page.getByText(/refund is being processed/).waitFor();
 assert.equal(new URL(page.url()).search,'');
 assert.equal(initializations,1);assert.equal(checks,1);
 assert.equal((await page.evaluate(()=>JSON.stringify(localStorage))).includes('AUTH_'),false);
 await page.screenshot({path:artifacts+'/linked-mobile.png',fullPage:true});
 refundStatus='processed';await page.getByRole('button',{name:'Check status',exact:true}).click();
 await page.getByText(/refund processed by Paystack/).waitFor();
 await page.getByRole('button',{name:'Pause',exact:true}).click();await page.getByText('Paused',{exact:true}).waitFor();
 await page.getByRole('button',{name:'Resume',exact:true}).click();await page.getByText('Paused',{exact:true}).waitFor({state:'detached'});
 await page.setViewportSize({width:1280,height:900});
 await page.screenshot({path:artifacts+'/linked-desktop.png',fullPage:true});
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 page.on('dialog',dialog=>dialog.accept());
 await page.getByRole('button',{name:'Remove',exact:true}).click();await page.getByText('You haven’t linked a card yet.').waitFor();
 await page.goto(origin+'/cards?reference='+reference);await page.getByText('You haven’t linked a card yet.').waitFor();
 await page.getByText(/Status updated/).waitFor();assert.equal(cards.length,0);assert.equal(initializations,1);
 failReads=true;await page.goto(origin+'/cards');await page.getByRole('alert').waitFor();
 failReads=false;await page.getByRole('button',{name:'Reload cards'}).click();await page.getByText('You haven’t linked a card yet.').waitFor();
 enabled=false;cards=[{...card}];await page.goto(origin+'/cards');
 await page.getByRole('heading',{name:'Actual Test Bank'}).waitFor();
 await page.getByText(/Payment setup is not complete/).waitFor();
 assert.equal(await page.getByRole('button',{name:'Continue to Paystack · ₦50'}).count(),0);
 enabled=true;await page.goto(origin+'/');await page.getByText('Card balance unavailable. Check your bank app for available funds.').waitFor();
 assert.equal((await page.locator('body').innerText()).includes('98,765'),false);
 for(const viewport of [{width:390,height:844},{width:1280,height:900}]){
  await page.setViewportSize(viewport);await page.screenshot({path:artifacts+`/direct-card-home-${viewport.width}.png`,fullPage:true});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 }
 assert.deepEqual(errors,[]);
 console.log('PASS: card consent/hosted checkout/server verification/refund pending-to-processed/pause/resume/remove/replay/load failure recovery; mobile and desktop. No real charge.');
}catch(error){await page.screenshot({path:artifacts+'/failure.png',fullPage:true}).catch(()=>{});throw error;}
finally{await context.close();await browser.close();}
