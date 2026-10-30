import { expect, it } from 'vitest';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
const sql=readFileSync(new URL('../../supabase/migrations/0027_ccnet_provider.sql',import.meta.url),'utf8');
const sql28=readFileSync(new URL('../../supabase/migrations/0028_live_operations_and_retakes.sql',import.meta.url),'utf8');
const source=readFileSync(new URL('../scripts/release-ccnet.ts',import.meta.url),'utf8').replaceAll('import.meta.url',JSON.stringify('file:///fixture/backend/scripts/release-ccnet.ts'));
const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
async function run({access=true,recorded=false,recorded27=false,failOperations=false,failMigration=false,dirty=false,different=false}={}) {
 const calls: Array<{kind:string;value:string;args?:unknown}> = []; const messages:string[]=[];
 let connections=0;
 const client={release:()=>{},query:async(value:string,args?:unknown)=>{
  calls.push({kind:'sql',value,args});
  if(value.includes('select statements'))return {rows:recorded||(recorded27&&value.includes('0027'))?[{statements:[different?'different':value.includes('0028')?sql28:sql]}]:[]};
  if(value.includes('select exists'))return {rows:[{migrated:false}]};
  if(value.includes('select prosrc'))return {rows:[{prosrc:'domain=p_domain p_validity>60 for update card_payment_attempts is_default'}]};
  if(value.includes('create table public.operation_events') && failOperations)throw new Error('private driver message');
  if(value.includes('alter table') && failMigration)throw new Error('credential-bearing driver message');
  return {rows:[]};
 }};
 const dependencies:Record<string,unknown>={
  'dotenv/config':{},'node:url':{fileURLToPath:()=>'/fixture/'},'node:fs':{readFileSync:(url:URL)=>url.href.includes('0028')?sql28:sql},
  '../src/auth/engine.js':{authPool:()=>({connect:async()=>{connections++;return client;},end:async()=>{}})},
  'node:child_process':{spawnSync:(_command:string,args:string[])=>{
   const value=args.join(' ');calls.push({kind:'git',value});
   if(value==='status --porcelain')return {status:0,stdout:dirty?'modified':''};
   if(value==='branch --show-current')return {status:0,stdout:'main'};
   if(value==='remote get-url origin')return {status:0,stdout:'https://github.com/Ayodeji63/PayByPalm.git'};
   return {status:access?0:1,stdout:''};
  }},
 };
 const process={env:{AUTH_DATABASE_URL:'postgresql://inert@localhost/test'},exitCode:0};
 vm.runInNewContext(compiled,{exports:{},require:(key:string)=>dependencies[key],URL,process,console:{log:(text:string)=>messages.push(text),error:(text:string)=>messages.push(text)}});
 for(let i=0;i<8;i++)await new Promise(resolve=>setImmediate(resolve));
 return {calls,messages,connections,exitCode:process.exitCode};
}
it('does not connect to the live database if GitHub write access is absent',async()=>{
 const r=await run({access:false});expect(r.connections).toBe(0);expect(r.exitCode).toBe(1);expect(r.messages.join(' ')).toContain('No database changes');
});
it('rejects uncommitted changes before requesting a publish or database connection',async()=>{
 const r=await run({dirty:true});expect(r.connections).toBe(0);expect(r.calls.some(c=>c.value.startsWith('push'))).toBe(false);
});
it('records the migration atomically and pushes only after the database commit',async()=>{
 const r=await run();expect(r.exitCode).toBe(0);
 const names=r.calls.map(c=>c.value);const insert=names.findIndex(name=>name.startsWith('insert into supabase_migrations'));
 expect(names.indexOf('begin')).toBeLessThan(insert);expect(insert).toBeLessThan(names.indexOf('commit'));expect(names.indexOf('commit')).toBeLessThan(names.indexOf('push origin HEAD:main'));
 const migration=r.calls.find(c=>c.value.includes('alter table'))!;expect(migration.value).not.toMatch(/^begin;$/m);expect(migration.value).not.toMatch(/^commit;$/m);
 expect(r.calls[insert]?.args).toEqual([[sql]]);
 const second=r.calls.find(c=>c.value.startsWith('insert into supabase_migrations')&&c.value.includes('0028'));expect(second?.args).toEqual([[sql28]]);
 expect(names.indexOf(second!.value)).toBeLessThan(names.indexOf('commit'));
});
it('rolls back a failed migration without publishing and hides driver details',async()=>{
 const r=await run({failMigration:true});expect(r.calls.some(c=>c.value==='rollback')).toBe(true);expect(r.calls.some(c=>c.value==='push origin HEAD:main')).toBe(false);expect(r.messages.join(' ')).not.toContain('credential-bearing');
});
it('can retry an already applied identical migration without applying it twice',async()=>{
 const r=await run({recorded:true});expect(r.exitCode).toBe(0);expect(r.calls.some(c=>c.value.includes('alter table'))).toBe(false);expect(r.calls.some(c=>c.value==='push origin HEAD:main')).toBe(true);
});
it('refuses a different migration record',async()=>{
 const r=await run({recorded:true,different:true});expect(r.exitCode).toBe(1);expect(r.calls.some(c=>c.value==='push origin HEAD:main')).toBe(false);
});

it('adds the operations migration when the CCNet schema is already recorded',async()=>{
 const r=await run({recorded27:true});expect(r.exitCode).toBe(0);expect(r.calls.some(c=>c.value.startsWith('insert into supabase_migrations')&&c.value.includes('0027'))).toBe(false);expect(r.calls.some(c=>c.value.startsWith('insert into supabase_migrations')&&c.value.includes('0028'))).toBe(true);
});
it('rolls back both migrations when the new operations migration fails',async()=>{
 const r=await run({failOperations:true});expect(r.exitCode).toBe(1);expect(r.calls.some(c=>c.value==='rollback')).toBe(true);expect(r.calls.some(c=>c.value==='commit'||c.value==='push origin HEAD:main')).toBe(false);
});
