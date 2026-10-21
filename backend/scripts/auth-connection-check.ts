/** Read-only identity readiness. Never prints URLs, credentials, email addresses or hashes. */
import 'dotenv/config';
import { authPool } from '../src/auth/engine.js';
const keys=['AUTH_DATABASE_URL','AUTH_SECRET','RESEND_API_KEY','RESEND_FROM_EMAIL'] as const;
let failed=false;
for(const key of keys){const ok=!!process.env[key];console.log(`${ok?'PASS':'MISSING'}: ${key} (value hidden)`);failed ||= !ok;}
if (failed) { process.exitCode=1; }
else {
 let pool: ReturnType<typeof authPool> | undefined;
 try {
  pool=authPool(process.env.AUTH_DATABASE_URL!);
  const r=await pool.query(`select (select count(*)::int from auth.users) as legacy_users,
   (select count(*)::int from public.profiles) as profiles,
   (select count(*)::int from pg_namespace where nspname='pbp_auth') as prepared`);
  console.log({connection:'ok',...r.rows[0]});
  if(r.rows[0].prepared){
   const state=await pool.query(`select count(*)::int as identities,count(*) filter(where "emailVerified" and not disabled)::int as verified_identities from pbp_auth."user"`);
   console.log(state.rows[0]);
  } else {console.log('PENDING: authentication cutover migration 0025. See AUTH_MIGRATION.md before applying.');process.exitCode=1;}
 }catch(error){console.error('FAIL: authentication database connection or schema check.',(error as {code?:string}).code??'connection_error');process.exitCode=1;}
 finally {await pool?.end();}
}
console.log('No accounts, passwords, sessions or emails were changed.');
