"""Exercise actual PostgreSQL constraints/RPCs in a disposable container only."""
import os,subprocess,time
from pathlib import Path
root=Path(__file__).resolve().parents[1]
container='pbp-admin-test-'+str(os.getpid())
def sql(text):
 r=subprocess.run(['docker','exec','-i',container,'psql','-U','postgres','-v','ON_ERROR_STOP=1','-q'],input=text,text=True,capture_output=True)
 if r.returncode:raise AssertionError(r.stderr)
try:
 subprocess.run(['docker','run','-d','--name',container,'-e','POSTGRES_PASSWORD=local-test-only','postgres:17-alpine'],check=True,capture_output=True)
 for _ in range(60):
  if subprocess.run(['docker','exec',container,'pg_isready','-U','postgres'],capture_output=True).returncode==0:break
  time.sleep(.5)
 sql('create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);create table public.profiles(id uuid primary key references auth.users(id));')
 # Use the real account/merchant/terminal definitions, not an alternate schema.
 core=(root/'tests/core_schema.sql').read_text()
 sql(core)
 sql("alter table public.merchants add column paystack_subaccount text check(paystack_subaccount ~ '^ACCT_[A-Za-z0-9]+$');")
 migration=(root/'db/0020_admin_onboarding.sql').read_text();sql(migration);sql(migration)
 sql((root/'tests/onboarding.sql').read_text())
 payout=(root/'db/0023_merchant_payouts.sql').read_text();sql(payout);sql(payout)
 sql((root/'tests/payouts.sql').read_text())
 # Independent DB connections race for one durable provider-POST claim.
 from concurrent.futures import ThreadPoolExecutor
 merchant='ffffffff-ffff-4fff-8fff-ffffffffffff'
 sql(f"select public.admin_save_merchant('aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa','{merchant}','Concurrent Payout',null,null,null,null,null);")
 def claim(_):
  query=f"select public.admin_begin_payout('aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa','{merchant}','test',gen_random_uuid(),repeat('c',64),'058','Fixture Bank','6789','FIXTURE OWNER',0,(select updated_at from public.merchants where id='{merchant}'))->>'claimed';"
  r=subprocess.run(['docker','exec',container,'psql','-U','postgres','-v','ON_ERROR_STOP=1','-Atc',query],text=True,capture_output=True)
  assert r.returncode==0,r.stderr
  return r.stdout.strip()
 with ThreadPoolExecutor(max_workers=8) as pool:claims=list(pool.map(claim,range(12)))
 assert claims.count('true')==1 and claims.count('false')==11,claims
 print('PASS: payout migration/rerun, concurrent single POST claim, replay, immutable payout destination, bank/mode isolation and service-only permissions.')
 print('PASS: additive/repeated migration, atomic merchant creation and rollback, idempotency, audit, terminal revocation/rotation, immutable association and service-only RPC permissions.')
finally:subprocess.run(['docker','rm','-f',container],capture_output=True)
