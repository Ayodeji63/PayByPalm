// Fixture-only regression for reader completion versus terminal authentication.
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {mkdirSync} from 'node:fs';
const origin=process.env.ADMIN_TEST_ORIGIN||'http://127.0.0.1:5190',out=new URL('../test-results/',import.meta.url).pathname;mkdirSync(out,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE});
const uid=n=>`${String(n).padStart(8,'0')}-1111-4111-8111-111111111111`;
try{for(const width of [1440,390])for(const decision of ['missing','reject','accept']){
 const context=await browser.newContext({viewport:{width,height:950}});const now=new Date().toISOString(),errors=[];
 await context.route('**/api/**',async route=>{
  const path=new URL(route.request().url()).pathname;let data;
  if(path==='/api/auth/session')data={user:{id:uid(1),email:'operator@example.test'}};
  else if(path==='/api/overview')data={terminals:[],merchants:[],activity:[],terminalUrl:origin+'/terminal'};
  else if(path==='/api/operations'){
   const base={request_id:uid(2),terminal_id:null,merchant_id:null,user_id:null,scope_id:uid(3),operation:'identification',occurred_at:now};
   data={backend:{status:'ready',cursor:'2',hasMore:false,events:decision==='missing'?[]:[{...base,id:'1',operation_id:uid(4),stage:'search',state:'succeeded',details:{upstreamRequestId:uid(5),score:84,providerMatched:true}},{...base,id:'2',operation_id:uid(6),stage:'authenticate',state:decision==='reject'?'rejected':'succeeded',details:{decision,score:decision==='reject'?84:91,...(decision==='reject'?{errorCode:'low_score'}:{})}}]},reader:{status:'ready',cursor:'1',gap:false,galleryCount:2,events:[{id:'1',source:'ccnet',operation_id:uid(7),request_id:uid(5),operation:'identification',user_id:null,palm_side:null,client_id:'paybypalm-backend',occurred_at:now,state:'succeeded',duration_ms:164,details:{matched:true,threshold:.5,candidates:[{user_id:uid(8),palm_side:'left',cosine_similarity:.8471496105194092}]}}]},updatedAt:now};
  }else throw Error('Unexpected fixture '+path);return route.fulfill({json:data});
 });
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto(origin+'/#/operations');const row=page.locator('.ops-table tbody tr').filter({hasText:'CCNet service'});await row.waitFor();assert.equal(await row.locator('.ops-state').textContent(),'Search completed');assert.equal(await row.locator('.ops-succeeded').count(),0);
 await row.getByRole('button').click();const detail=page.getByRole('region',{name:'Operation details'});await detail.waitFor();
 const expected=decision==='missing'?'Decision unavailable':decision==='reject'?'Palm rejected':'Palm accepted';assert.ok((await detail.locator('.ops-auth-outcome').textContent()).includes(expected));assert.equal(await detail.getByText('Payment confirmed',{exact:true}).count(),0);
 if(decision==='reject'){assert.ok((await detail.locator('.ops-auth-outcome').textContent()).includes('84/100'));assert.ok((await detail.locator('.ops-trace').textContent()).includes('authenticate · Palm rejected'));}
 if(decision==='missing')assert.ok((await detail.textContent()).includes('No linked terminal authentication decision'));
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);assert.deepEqual(errors,[]);
 if(process.env.SCREENSHOTS!=='0'&&((width===1440&&decision==='reject')||(width===390&&decision==='missing')))await page.screenshot({path:out+`operation-outcome-${decision}-${width}.png`,fullPage:true});
 console.log(`PASS: ${width}px ${decision}: search completion remains distinct from terminal authentication and payment.`);await context.close();
}}finally{await browser.close();}
