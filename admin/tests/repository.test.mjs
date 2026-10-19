import {describe,it,expect} from 'vitest';
import {cpSync,existsSync,mkdtempSync,mkdirSync,readFileSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {prepareDeployment} from '../scripts/deploy-vercel.mjs';
import {readAdminLink} from '../scripts/check-vercel-project.mjs';
const appRoot=fileURLToPath(new URL('../',import.meta.url));
function fixture(){
 const directory=mkdtempSync(path.join(tmpdir(),'pbp-admin-link-test-'));
 mkdirSync(path.join(directory,'.vercel'));
 writeFileSync(path.join(directory,'.vercel/project.json'),JSON.stringify({projectName:'paybypalm-admin',projectId:'prj_fixture',orgId:'team_fixture'}));
 writeFileSync(path.join(directory,'package.json'),JSON.stringify({name:'paybypalm-admin'}));
 writeFileSync(path.join(directory,'vercel.json'),'{}');
 return directory;
}
describe('admin in the PayByPalm repository',()=>{
 it('ignores local credentials and dependencies while allowing the environment template',()=>{
  const rules=readFileSync(path.join(appRoot,'.gitignore'),'utf8');
  for(const rule of ['.env\n','.env.*\n','!.env.example\n','node_modules/','dist/','.vercel/','test-results/'])expect(rules).toContain(rule);
  expect(existsSync(path.join(appRoot,'.git'))).toBe(false);
 });
 it('stages an admin/ layout for the existing project without private files or Git metadata',()=>{
  const source=fixture();let staged;
  try{
   for(const directory of ['.git','node_modules','dist','test-results']){mkdirSync(path.join(source,directory));writeFileSync(path.join(source,directory,'private'),'private-marker');}
   writeFileSync(path.join(source,'.env'),'private-marker');writeFileSync(path.join(source,'.env.local'),'private-marker');
   writeFileSync(path.join(source,'.env.example'),'PAYSTACK_MODE=test');mkdirSync(path.join(source,'server'));writeFileSync(path.join(source,'server/app.ts'),'export const server=true;');
   const before=readFileSync(path.join(source,'.vercel/project.json'),'utf8');
   staged=prepareDeployment(source,{});
   expect(existsSync(path.join(staged.directory,'admin/server/app.ts'))).toBe(true);
   expect(existsSync(path.join(staged.directory,'admin/.env.example'))).toBe(true);
   for(const name of ['.git','.vercel','.env','.env.local','node_modules','dist','test-results'])expect(existsSync(path.join(staged.directory,'admin',name))).toBe(false);
   expect(JSON.parse(readFileSync(path.join(staged.directory,'.vercel/project.json'),'utf8')).projectName).toBe('paybypalm-admin');
   expect(readFileSync(path.join(source,'.vercel/project.json'),'utf8')).toBe(before);
  }finally{staged?.cleanup();rmSync(source,{recursive:true,force:true});}
 });
 it('refuses an inherited project override before copying or deploying',()=>{
  const source=fixture();try{expect(()=>readAdminLink(source,{VERCEL_PROJECT_ID:'prj_wallet'})).toThrow('overrides');}finally{rmSync(source,{recursive:true,force:true});}
 });
 it('refuses a wallet project link',()=>{
  const source=fixture();try{
   writeFileSync(path.join(source,'.vercel/project.json'),JSON.stringify({projectName:'pay-by-palm',projectId:'prj_wallet',orgId:'team_fixture'}));
   expect(()=>prepareDeployment(source,{})).toThrow('paybypalm-admin');
  }finally{rmSync(source,{recursive:true,force:true});}
 });
});
