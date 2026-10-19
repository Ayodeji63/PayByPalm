import {readFileSync} from 'node:fs';
import {fileURLToPath,pathToFileURL} from 'node:url';
import path from 'node:path';

export function readAdminLink(appRoot=fileURLToPath(new URL('../',import.meta.url)),environment=process.env){
 const linked=JSON.parse(readFileSync(path.join(appRoot,'.vercel/project.json'),'utf8'));
 if(linked.projectName!=='paybypalm-admin'||!/^prj_[A-Za-z0-9]+$/.test(linked.projectId)||!/^team_[A-Za-z0-9]+$/.test(linked.orgId)){
  throw new Error('This directory must be linked to the paybypalm-admin Vercel project.');
 }
 for(const [variable,expected] of [['VERCEL_PROJECT_ID',linked.projectId],['VERCEL_ORG_ID',linked.orgId]]){
  if(environment[variable]&&environment[variable]!==expected)throw new Error(`${variable} overrides the intended admin project. Remove the override before deploying.`);
 }
 return linked;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 try{readAdminLink();console.log('Deployment target verified: paybypalm-admin; repository Root Directory: admin.');}
 catch(error){
  console.error(error.code==='ENOENT'?'The admin directory is not linked to Vercel.':error.message);
  console.error('From admin/, run npx vercel link --yes --project paybypalm-admin.');process.exitCode=1;
 }
}
