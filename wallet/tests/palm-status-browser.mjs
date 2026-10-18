// Real wallet UI with fixture APIs only. Never calls Tencent or deletes real data.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdirSync} from 'node:fs';
const {chromium}=createRequire(import.meta.url)('playwright');
const browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE||undefined});
const context=await browser.newContext({viewport:{width:390,height:844}});
const origin=process.env.PBP_PREVIEW_ORIGIN||'http://127.0.0.1:4178';
const artifacts='/tmp/pbp-palm-status';mkdirSync(artifacts,{recursive:true});
let linked=true,failRemoval=true,removals=0;
await context.addInitScript(()=>localStorage.setItem('paybypalm.session',JSON.stringify({accessToken:'fixture-access',refreshToken:'fixture-refresh'})));
await context.route('**/*',async route=>{
 const request=route.request(),path=new URL(request.url()).pathname;
 if(!['/me','/cards','/transactions','/palm/revoke'].includes(path))return route.continue();
 let status=200,data;
 if(path==='/me')data={id:'fixture-user',fullName:'Test User',phone:'08010001234',email:'user@example.test',hasPin:true,palmEnrolled:linked,balanceMinor:null,cardBalanceAvailable:false,paymentSource:'linked_card',currency:'NGN',createdAt:'2026-10-18T00:00:00Z'};
 else if(path==='/cards')data={enabled:true,testMode:true,cards:[],attempts:[]};
 else if(path==='/palm/revoke'){
  assert.equal(request.method(),'POST');assert.deepEqual(request.postDataJSON(),{});removals++;
  if(failRemoval){status=503;data={error:{code:'palm_unlink_incomplete',message:'Palm removal could not be confirmed. Please retry.'}};}
  else{linked=false;data={revoked:true};}
 }else data={transactions:[]};
 await route.fulfill({status,json:data,headers:{'Access-Control-Allow-Origin':'*','Cache-Control':'no-store'}});
});
const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
try{
 await page.goto(origin+'/dashboard');
 const panel=page.getByRole('region',{name:'Palm link status'});
 await panel.getByRole('heading',{name:'Palm linked',exact:true}).waitFor();
 await panel.screenshot({path:artifacts+'/dashboard-linked-mobile.png'});
 await panel.getByRole('button',{name:'Unlink palm',exact:true}).click();
 await panel.getByRole('button',{name:'Yes, unlink palm'}).click();
 await panel.getByRole('alert').waitFor();
 await panel.getByRole('heading',{name:'Palm linked',exact:true}).waitFor();
 await panel.screenshot({path:artifacts+'/unlink-error-mobile.png'});
 failRemoval=false;await panel.getByRole('button',{name:'Yes, unlink palm'}).click();
 await panel.getByRole('heading',{name:'Palm not linked',exact:true}).waitFor();
 await panel.getByRole('button',{name:'Link palm',exact:true}).waitFor();
 await panel.screenshot({path:artifacts+'/dashboard-unlinked-mobile.png'});
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 await panel.getByRole('button',{name:'Link palm',exact:true}).click();
 await page.waitForURL('**/consent');
 linked=true;await page.setViewportSize({width:1280,height:900});await page.goto(origin+'/profile');
 await panel.getByRole('heading',{name:'Palm linked',exact:true}).waitFor();
 await panel.screenshot({path:artifacts+'/profile-linked-desktop.png'});
 await panel.getByRole('button',{name:'Unlink palm',exact:true}).click();
 await panel.getByRole('button',{name:'Yes, unlink palm'}).click();
 await panel.getByRole('heading',{name:'Palm not linked',exact:true}).waitFor();
 await page.reload();await panel.getByRole('heading',{name:'Palm not linked',exact:true}).waitFor();
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 await page.setViewportSize({width:390,height:844});await page.goto(origin+'/profile');
 const unlink=panel.getByRole('button',{name:'Unlink palm',exact:true});await unlink.waitFor();
 const bounds=await unlink.boundingBox();assert.ok(bounds&&bounds.y>=0&&bounds.y+bounds.height<844,'Profile unlink must be visible before scrolling');
 await page.screenshot({path:artifacts+'/profile-unlinked-mobile.png'});
 await unlink.click();await panel.getByRole('button',{name:'Yes, unlink palm'}).click();
 await panel.getByRole('status').waitFor();
 assert.equal(removals,4);assert.deepEqual(errors,[]);
 console.log('PASS: mobile/desktop dashboard and profile; failed and confirmed removal; fresh consent; removal remains available when the profile flag is false and is visible without scrolling. Fixture APIs only.');
}catch(error){await page.screenshot({path:artifacts+'/failure.png',fullPage:true}).catch(()=>{});throw error;}
finally{await context.close();await browser.close();}
