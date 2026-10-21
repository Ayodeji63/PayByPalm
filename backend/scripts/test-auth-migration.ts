/** Integration test: localhost disposable PostgreSQL + fake email delivery only. */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import bcrypt from 'bcryptjs';
import { authPool, createIdentity, withDeliveryStatus, type AuthSettings } from '../src/auth/engine.js';
const databaseURL = process.env.AUTH_TEST_DATABASE_URL;
if (!databaseURL || !['localhost', '127.0.0.1'].includes(new URL(databaseURL).hostname))
  throw new Error('Use AUTH_TEST_DATABASE_URL for a disposable loopback database only');
const messages: Array<{email:string;purpose:string;token:string}> = [];
let mailDown = false;
const settings: AuthSettings = { databaseURL,
  secret: 'isolated-test-secret-that-is-not-used-in-production', baseURL: 'http://localhost:8080', walletURL: 'http://localhost:5173',
  send: async (email,purpose,token) => { if(mailDown)throw new Error('simulated mail outage'); messages.push({email,purpose,token}); },
};
const pool = authPool(databaseURL);
let engine: ReturnType<typeof createIdentity>["engine"];
const legacy = '11111111-1111-4111-8111-111111111111';
const headers = (token:string) => new Headers({authorization:`Bearer ${token}`});
const migration = await readFile(new URL('../../supabase/migrations/0025_resend_auth.sql',import.meta.url),'utf8');
try {
  await pool.query(`insert into auth.users(id,email,email_confirmed_at,encrypted_password,raw_user_meta_data)
    values($1,'legacy@example.com',now(),$2,'{"full_name":"Existing Customer","phone":"08010001234"}')`, [legacy,await bcrypt.hash('existing-password',10)]);
  await pool.query("insert into public.palm_bindings(user_id,tencent_palm_id) values($1,'existing-palm-id')",[legacy]);
  await pool.query("insert into public.linked_cards(user_id,signature_hash,authorization_ciphertext,bank,brand,last4,exp_month,exp_year,is_default,domain) values($1,repeat('a',64),'existing-encrypted-token','Bank','visa','1234','12','2030',true,'test')",[legacy]);
  await pool.query("insert into public.transactions(amount_minor,matched_user_id,status) values(5000,$1,'settled')",[legacy]);
  await pool.query("insert into public.merchant_memberships(merchant_id,user_id,granted_by) select id,$1,$1 from public.merchants limit 1",[legacy]);
  const snapshot = async () => {
    const result:Record<string,unknown>={};
    for(const table of ['profiles','accounts','palm_bindings','linked_cards','transactions','merchant_memberships'])
      result[table]=(await pool.query(`select row_to_json(t) as data from public.${table} t order by id`)).rows;
    return result;
  };
  const saved = await snapshot();
  const before = (await pool.query('select row_to_json(p) as p from public.profiles p where id=$1',[legacy])).rows;
  const wallet = (await pool.query('select id from public.accounts where user_id=$1',[legacy])).rows;
  await pool.query(migration);
  engine = createIdentity(settings, pool).engine;
  assert.deepEqual(await snapshot(),saved);
  assert.deepEqual((await pool.query('select row_to_json(p) as p from public.profiles p where id=$1',[legacy])).rows,before);
  assert.deepEqual((await pool.query('select id from public.accounts where user_id=$1',[legacy])).rows,wallet);
  assert.equal((await pool.query(`select count(*)::int n from pg_constraint where contype='f' and confrelid='auth.users'::regclass and connamespace='public'::regnamespace`)).rows[0].n,0);
  const merchant=(await pool.query('select merchant_id from public.merchant_memberships where user_id=$1',[legacy])).rows[0].merchant_id;
  const listed=await pool.query('select public.admin_list_merchant_access($1) as grants',[merchant]);
  assert.equal(listed.rows[0].grants[0].user_id,legacy);
  assert.equal((await pool.query("select * from public.lookup_verified_identity('legacy@example.com',null)")).rows[0].id,legacy);
  const login = await engine.api.signInEmail({body:{email:'legacy@example.com',password:'existing-password'}});
  assert.equal(login.user.id,legacy);assert.ok(login.token);
  assert.equal((await engine.api.getSession({headers:headers(login.token!)}))?.user.id,legacy);
  await assert.rejects(engine.api.signInEmail({body:{email:'legacy@example.com',password:'wrong-password'}}));
  await pool.query(`update pbp_auth.session set \"expiresAt\"=now()-interval '1 second' where token=$1`,[login.token]);
  assert.equal(await engine.api.getSession({headers:headers(login.token!)}),null);
  assert.equal(await engine.api.getSession({headers:headers('old-supabase-token')}),null);
  const signup = await engine.api.signUpEmail({body:{name:'New Customer',email:'new@example.com',password:'new-password',phone:'08010001235'}});
  assert.equal(signup.token,null);
  await assert.rejects(engine.api.signInEmail({body:{email:'new@example.com',password:'new-password'}}));
  const id=signup.user.id;
  for (const query of ['select count(*)::int n from public.profiles where id=$1','select count(*)::int n from public.accounts where user_id=$1'])
    assert.equal((await pool.query(query,[id])).rows[0].n,1);
  await engine.api.sendVerificationEmail({body:{email:'new@example.com'}});
  const confirmation=messages.find(m=>m.email==='new@example.com'&&m.purpose==='verify')!;
  assert.ok(confirmation.token);
  await assert.rejects(engine.api.verifyEmail({query:{token:'invalid'}}));
  await engine.api.verifyEmail({query:{token:confirmation.token}});
  await pool.query('select public.admin_grant_merchant_access($1,$2,$3)',[legacy,merchant,'new@example.com']);
  assert.equal((await pool.query('select user_id from public.merchant_memberships where merchant_id=$1 and user_id=$2',[merchant,id])).rows[0].user_id,id);
  let signed=await engine.api.signInEmail({body:{email:'new@example.com',password:'new-password'}});
  assert.ok(signed.token);
  await engine.api.signOut({headers:headers(signed.token!)});
  assert.equal(await engine.api.getSession({headers:headers(signed.token!)}),null);
  signed=await engine.api.signInEmail({body:{email:'new@example.com',password:'new-password'}});
  await engine.api.requestPasswordReset({body:{email:'new@example.com'}});
  const reset=messages.find(m=>m.email==='new@example.com'&&m.purpose==='reset')!;
  assert.ok(reset.token);
  await engine.api.resetPassword({body:{token:reset.token,newPassword:'replacement-password'}});
  assert.equal(await engine.api.getSession({headers:headers(signed.token!)}),null);
  await assert.rejects(engine.api.resetPassword({body:{token:reset.token,newPassword:'reuse-token-password'}}));
  await assert.rejects(engine.api.signInEmail({body:{email:'new@example.com',password:'new-password'}}));
  assert.equal((await engine.api.signInEmail({body:{email:'new@example.com',password:'replacement-password'}})).user.id,id);
  await pool.query(migration);
  assert.equal((await engine.api.signInEmail({body:{email:'new@example.com',password:'replacement-password'}})).user.id,id);
  await assert.rejects(pool.query(`insert into auth.users(email,raw_user_meta_data) values('retired@example.com','{"full_name":"Legacy signup","phone":"08010001236"}')`));
  const privilege = await pool.query(`select has_schema_privilege('anon','pbp_auth','usage') as a,has_table_privilege('authenticated','public.profiles','select') as p`);
  assert.deepEqual(privilege.rows[0],{a:false,p:false});
  mailDown=true;
  await engine.api.signUpEmail({body:{name:'Mail Outage',email:'outage@example.com',password:'new-password',phone:'08010001237'}});
  await assert.rejects(withDeliveryStatus(() => engine.api.sendVerificationEmail({body:{email:'outage@example.com'}})));
  await assert.rejects(engine.api.signInEmail({body:{email:'outage@example.com',password:'new-password'}}));
  mailDown=false;
  await engine.api.sendVerificationEmail({body:{email:'outage@example.com'}});
  const retry=await engine.api.signUpEmail({body:{name:'Mail Outage',email:'outage@example.com',password:'new-password',phone:'08010001237'}});
  assert.equal(retry.token,null);
  await assert.rejects(engine.api.signUpEmail({body:{name:'Bad Profile',email:'bad@example.com',password:'new-password',phone:'bad-phone'}}));
  assert.equal((await pool.query(`select count(*)::int n from pbp_auth."user" where email='bad@example.com'`)).rows[0].n,0);
  console.log('PASS: UUID/password migration, atomic profiles/accounts, verified-only login, opaque sessions, logout, reset/revocation, single-use recovery, rerunnable migration, legacy rejection and private tables. No external emails sent.');
} finally { await pool.end(); }
