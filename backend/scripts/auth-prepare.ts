/** Prepare one persistent signing secret privately. Never prints credential values. */
import { randomBytes } from 'node:crypto';
import { readFile, writeFile, chmod } from 'node:fs/promises';
import { parse } from 'dotenv';
const path = new URL('../.env',import.meta.url);
let text = await readFile(path,'utf8').catch(()=> '');
const values=parse(text);
if (!values.AUTH_SECRET) {
  text=text.replace(/^AUTH_SECRET=.*$/m,'');
  await writeFile(path,text.trimEnd()+`\nAUTH_SECRET=${randomBytes(32).toString('base64')}\n`,{mode:0o600});
  await chmod(path,0o600);
  console.log('AUTH_SECRET generated and saved privately to backend/.env. Value hidden.');
} else console.log('Existing AUTH_SECRET preserved. Value hidden.');
console.log('Copy this same AUTH_SECRET privately to Render together with AUTH_DATABASE_URL, RESEND_API_KEY and RESEND_FROM_EMAIL.');
