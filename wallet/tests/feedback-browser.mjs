// Customer/admin/public workflow with in-memory fixtures. No hosted writes or charges.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdirSync} from 'node:fs';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE||'playwright');
const origin=process.env.PBP_PREVIEW_ORIGIN||'http://127.0.0.1:5177',admin=process.env.ADMIN_TEST_ORIGIN||'http://127.0.0.1:5190';
const out='/tmp/paybypalm-feedback-browser';mkdirSync(out,{recursive:true});
const capture=async(target,options)=>{if(process.env.SCREENSHOTS!=='0')await target.screenshot(options);};
const browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE});
const id='aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',owner='bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb';
try{for(const width of [390,1280]){
 let row=null,revision=0,saves=0,failSave=false;const errors=[];
 const context=await browser.newContext({viewport:{width,height:900},reducedMotion:'reduce',serviceWorkers:'block'});
 await context.addInitScript(()=>{if(!sessionStorage.getItem('feedback-fixture-seeded')){localStorage.setItem('paybypalm.identity.session',JSON.stringify({accessToken:'fixture-token',refreshToken:'fixture-refresh'}));sessionStorage.setItem('feedback-fixture-seeded','1');}});
 await context.route('**/*',async route=>{
  const req=route.request(),url=new URL(req.url()),path=url.pathname;
  const headers={'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Headers':'Content-Type,Authorization','Access-Control-Allow-Methods':'GET,POST,OPTIONS'};
  if(req.method()==='OPTIONS')return route.fulfill({status:204,headers});
  if(req.isNavigationRequest()||(url.origin===origin&&!/^\/(feedback|me|cards|transactions)(\/|$)/.test(path))||(url.origin===admin&&!path.startsWith('/api/')))return route.continue();
  let data,status=200;
  if(path==='/me')data={id:owner,fullName:'Feedback Fixture',email:'feedback@example.test',phone:'+2348123456789',hasPin:true,palmEnrolled:false,paymentMode:'test',currency:'NGN',createdAt:'2026-11-01T00:00:00Z'};
  else if(path==='/cards')data={cards:[],attempts:[],paymentMode:'test',enabled:true,amountMinor:5000,currency:'NGN'};
  else if(path==='/feedback/mine')data={feedback:row};
  else if(path==='/feedback/public')data={reviews:row?.published_at?[{id:row.id,rating:row.rating,comment:row.comment,published_at:row.published_at}]:[]};
  else if(path==='/feedback'){
   const body=req.postDataJSON();assert.deepEqual(Object.keys(body).sort(),['comment','rating']);saves++;
   if(failSave){status=503;data={error:{code:'feedback_unavailable',message:'Feedback is unavailable. Please try again later.'}};}
   else{row={id,user_id:owner,rating:body.rating,comment:body.comment,created_at:'2026-11-01T00:00:00Z',updated_at:new Date(++revision*1000).toISOString(),published_at:null};data={feedback:row};}
  }else if(path==='/api/auth/session')data={user:{id,email:'operator@example.test'}};
  else if(path==='/api/overview')data={merchants:[],terminals:[],activity:[],terminalUrl:origin+'/terminal'};
  else if(path==='/api/feedback')data={feedback:row?[row]:[],total:row?1:0,page:1,pageSize:10};
  else if(path==='/api/feedback/'+id){const body=req.postDataJSON();assert.equal(body.expected,row.updated_at);row={...row,published_at:body.publish?new Date().toISOString():null,updated_at:new Date(++revision*1000).toISOString()};data={feedback:row};}
  else return route.abort();
  await route.fulfill({status,json:data,headers});
 });
 const wallet=await context.newPage(),operator=await context.newPage();for(const page of [wallet,operator])page.on('pageerror',e=>errors.push(e.message));operator.on('dialog',dialog=>dialog.accept());
 try{
  await wallet.goto(origin+'/profile');const form=wallet.getByRole('region',{name:'Rate your PayByPalm experience'});
  await form.getByRole('button',{name:'Save feedback'}).waitFor();await form.getByText('Loading your feedback…').waitFor({state:'detached'});assert.equal(await form.getByRole('button',{name:'Save feedback'}).isDisabled(),true);
  await form.getByRole('radio',{name:'4 stars',exact:true}).check();
  await form.getByLabel('Your comment',{exact:true}).fill('A smooth checkout. <img src=x onerror=alert(1)>');
  await form.getByRole('button',{name:'Save feedback'}).click();await form.getByText('Thank you. Your feedback was saved privately for review.').waitFor();assert.equal(row.published_at,null);assert.equal(saves,1);
  await capture(form,{path:out+`/wallet-${width}.png`});
  await operator.goto(admin+'/#/feedback');await operator.getByRole('heading',{name:'4/5 rating',exact:true}).waitFor();assert.equal(await operator.locator('.feedback-comment img').count(),0);
  await operator.getByRole('button',{name:'Publish review',exact:true}).click();await operator.getByRole('button',{name:'Unpublish',exact:true}).waitFor();assert.ok(row.published_at);
  await capture(operator,{path:out+`/admin-${width}.png`,fullPage:true});
  // Remove only the fixture session so the public welcome page is exercised.
  await wallet.evaluate(()=>localStorage.removeItem('paybypalm.identity.session'));await wallet.goto(origin+'/');await wallet.getByRole('heading',{name:'Community feedback'}).waitFor();
  assert.equal(await wallet.locator('[aria-labelledby="public-feedback-title"] img').count(),0);
  await wallet.getByText('A smooth checkout. <img src=x onerror=alert(1)>',{exact:true}).waitFor();
  assert.equal((await wallet.locator('[aria-labelledby="public-feedback-title"]').innerText()).includes(owner),false);
  await capture(wallet.locator('[aria-labelledby="public-feedback-title"]'),{path:out+`/public-${width}.png`});
  await operator.getByRole('button',{name:'Unpublish',exact:true}).click();await operator.getByRole('button',{name:'Publish review',exact:true}).waitFor();assert.equal(row.published_at,null);
  // Publish again, then ensure a customer edit removes public visibility.
  await operator.getByRole('button',{name:'Publish review',exact:true}).click();await operator.getByRole('button',{name:'Unpublish',exact:true}).waitFor();
  await wallet.evaluate(()=>localStorage.setItem('paybypalm.identity.session',JSON.stringify({accessToken:'fixture-token',refreshToken:'fixture-refresh'})));await wallet.goto(origin+'/profile');await form.getByText('Your current review is published. Editing it sends it back for review.').waitFor();
  await form.getByLabel('Your comment',{exact:true}).fill('Updated comment, awaiting another review.');await form.getByRole('button',{name:'Save feedback'}).click();await form.getByText('Thank you. Your feedback was saved privately for review.').waitFor();assert.equal(row.published_at,null);
  failSave=true;await form.getByLabel('Your comment',{exact:true}).fill('Keep this draft after a failed save.');await form.getByRole('button',{name:'Save feedback'}).click();await form.getByRole('alert').waitFor();assert.equal(await form.getByLabel('Your comment',{exact:true}).inputValue(),'Keep this draft after a failed save.');assert.equal(row.comment,'Updated comment, awaiting another review.');
  assert.equal(await wallet.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);assert.equal(await operator.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);assert.deepEqual(errors,[]);
  console.log(`PASS ${width}px: private rating/comment, admin publish/unpublish, plain-text public projection, edit resets publication, failed-save draft retained.`);
 }catch(error){await wallet.screenshot({path:out+`/failure-wallet-${width}.png`,fullPage:true}).catch(()=>{});await operator.screenshot({path:out+`/failure-admin-${width}.png`,fullPage:true}).catch(()=>{});throw error;}
 finally{await context.close();}
}}finally{await browser.close();}
