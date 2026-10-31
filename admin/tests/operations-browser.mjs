// All API calls use fixtures. No production login, biometrics or card charges.
import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
import {chromium} from 'playwright';
const origin=process.env.ADMIN_TEST_ORIGIN||'http://127.0.0.1:5190',out=new URL('../test-results/',import.meta.url).pathname;
mkdirSync(out,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE});
const uid=n=>`${String(n).padStart(8,'0')}-1111-4111-8111-111111111111`,now=new Date().toISOString();
const terminal={id:uid(1),merchant_id:uid(2),label:'Counter 1',last_seen_at:now,created_at:now,updated_at:now,disabled_at:null};
const merchant={id:uid(2),name:'Ayo Stores',created_at:now,updated_at:now};
const event=(id,operation,stage,state,details={})=>({id:String(id),operation_id:uid(id+10),request_id:uid(id+20),terminal_id:terminal.id,merchant_id:merchant.id,user_id:uid(3),scope_id:uid(4),operation,stage,state,occurred_at:new Date(Date.now()-(8-id)*400).toISOString(),details});
try{for(const width of [1440,390]){
 const context=await browser.newContext({viewport:{width,height:width===390?844:1050}});let polls=0;const errors=[];
 await context.route('**/api/**',async route=>{
  const url=new URL(route.request().url());let data;
  if(url.pathname==='/api/auth/session')data={user:{id:uid(5),email:'operator@example.test'}};
  else if(url.pathname==='/api/auth/logout')return route.fulfill({status:204});
  else if(url.pathname==='/api/overview')data={terminals:[terminal],merchants:[merchant],activity:[],terminalUrl:origin+'/terminal'};
  else if(url.pathname==='/api/operations'){
   polls++;const incremental=url.searchParams.has('after');
   const events=incremental?[event(7,'payment','payment_status','succeeded',{result:'settled',durationMs:680})]:[event(1,'enrollment','session_claim','succeeded',{result:'claimed'}),event(2,'capture','frame_captured','observed',{frameCount:3}),event(3,'enrollment','register','succeeded',{sampleCount:3,minimumPairSimilarity:.94,upstreamRequestId:uid(99),durationMs:235}),event(4,'verification','compare','rejected',{score:79,cosineSimilarity:.793,errorCode:'palm_capture_rejected'}),event(5,'identification','authenticate','succeeded',{score:91,decision:'accept',durationMs:181}),event(6,'payment','confirm','started')];
   data={backend:{status:'ready',events,cursor:incremental?'7':'6',hasMore:false},reader:{status:'ready',events:incremental?[]:[{id:'1',source:'ccnet',operation_id:uid(98),request_id:uid(99),operation:'enrollment',user_id:uid(4),palm_side:'right',client_id:'paybypalm-backend',occurred_at:now,state:'succeeded',duration_ms:194,details:{sample_count:3,minimum_pair_similarity:.94}}],cursor:'1',gap:false,galleryCount:12},updatedAt:new Date().toISOString()};
  }else throw Error('Unexpected fixture '+url.pathname);
  return route.fulfill({json:data});
 });
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto(origin+'/#/operations');await page.getByRole('heading',{name:'Operations monitor'}).waitFor();await page.getByText('12 palms',{exact:true}).waitFor();
 assert.equal(await page.getByRole('button',{name:'Add terminal',exact:true}).count(),0);
 await page.getByRole('button',{name:'Pause',exact:true}).click();const count=polls;await page.waitForTimeout(2300);assert.equal(polls,count);
 await page.getByLabel('Operation',{exact:true}).selectOption('enrollment');assert.equal(await page.locator('.ops-table tbody tr').count(),1);
 await page.getByRole('button',{name:/Details for enrollment/}).first().click();await page.getByRole('region',{name:'Operation details'}).waitFor();if(process.env.SCREENSHOTS!=='0')await page.screenshot({path:out+`operations-${width}.png`,fullPage:true});
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'Ledger overflow stays inside table');
 await page.getByLabel('Operation',{exact:true}).selectOption('all');await page.getByRole('button',{name:'Resume updates',exact:true}).click();await page.locator('.ops-table').getByText('Payment confirmed',{exact:true}).waitFor();
 await page.getByRole('button',{name:'Sign out',exact:true}).first().click();await page.getByRole('heading',{name:'Welcome back'}).waitFor();assert.equal(await page.locator('.ops-table').count(),0);assert.deepEqual(errors,[]);
 console.log(`PASS: operations ${width}px, polling, pause/resume, filters, details, responsive layout and logout. Fixtures only.`);await context.close();
}}finally{await browser.close();}
