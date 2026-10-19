// Run after `pnpm build`. No private .env, real database, palm or payment calls.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {createServer} from 'node:http';
import {fileURLToPath} from 'node:url';
import {test} from 'node:test';

test('compiled production entrypoint binds PORT and serves health without pnpm', {timeout:15000}, async()=>{
 const unexpected=[];
 const database=createServer((req,res)=>{
  const path=new URL(req.url,'http://fixture').pathname;
  res.setHeader('Content-Type','application/json');
  if(req.method==='POST'&&path==='/rest/v1/rpc/consume_api_budget')res.end('0');
  else if(req.method==='HEAD'&&path==='/rest/v1/merchants'){
   res.setHeader('Content-Range','0-0/1');res.end();
  }else{unexpected.push(`${req.method} ${path}`);res.statusCode=500;res.end('{}');}
 });
 database.listen(0,'127.0.0.1');await once(database,'listening');
 const reservation=createServer();reservation.listen(0,'127.0.0.1');await once(reservation,'listening');
 const port=reservation.address().port;
 await new Promise(resolve=>reservation.close(resolve));
 let child;
 try{
  child=spawn(process.execPath,[fileURLToPath(new URL('../dist/index.js',import.meta.url))],{
   cwd:fileURLToPath(new URL('..',import.meta.url)),
   // Do not inherit the shell's credentials, NODE_OPTIONS, or local .env.
   env:{PATH:process.env.PATH,DOTENV_CONFIG_PATH:'/dev/null',NODE_ENV:'production',
    PORT:String(port),LOG_LEVEL:'info',PAYSTACK_MODE:'test',
    SUPABASE_URL:`http://127.0.0.1:${database.address().port}`,
    SUPABASE_SERVICE_ROLE_KEY:'startup-fixture',SUPABASE_ANON_KEY:'startup-fixture',
    PALM_PROVIDER:'tencent',TENCENT_PALM_API_KEY:'startup-fixture',
    TENCENT_BASE_URL:'http://127.0.0.1:9',WALLET_BASE_URL:'https://wallet.example.test'},
   stdio:['ignore','pipe','pipe'],
  });
  const exited=once(child,'exit');let output='';
  await new Promise((resolve,reject)=>{
   const timer=setTimeout(()=>reject(new Error('API did not listen within 5 seconds: '+output)),5000);
   const failed=error=>{clearTimeout(timer);reject(error);};
   child.once('error',failed);
   child.once('exit',code=>failed(new Error(`API exited before binding (${code}): ${output}`)));
   child.stdout.on('data',chunk=>{
    output+=chunk;
    if(output.includes('PayByPalm API listening')){clearTimeout(timer);resolve();}
   });
   child.stderr.on('data',chunk=>{output+=chunk;});
  });
  const listening=output.split('\n').filter(Boolean).map(line=>JSON.parse(line)).find(row=>row.msg==='PayByPalm API listening');
  assert.equal(listening.port,port);assert.equal(listening.host,'0.0.0.0');
  const health=await fetch(`http://127.0.0.1:${port}/health`,{signal:AbortSignal.timeout(3000)});
  assert.equal(health.status,200);assert.equal((await health.json()).status,'ok');
  const settings=await fetch(`http://127.0.0.1:${port}/payment-settings`,{signal:AbortSignal.timeout(3000)});
  assert.equal(settings.status,200);assert.deepEqual(await settings.json(),{paymentMode:'test'});
  assert.deepEqual(unexpected,[]);
  child.kill('SIGTERM');
  const timeout=setTimeout(()=>child.kill('SIGKILL'),3000);
  const [code,signal]=await exited;clearTimeout(timeout);
  assert.equal(code,0);assert.equal(signal,null);
 }finally{
  if(child&&child.exitCode===null&&child.signalCode===null)child.kill('SIGKILL');
  database.closeAllConnections();await new Promise(resolve=>database.close(resolve));
 }
});
