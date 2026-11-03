"""Real provisioning claims and races. Disposable database; never calls Flutterwave."""
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
import os,subprocess,time,uuid,json
root=Path(__file__).resolve().parents[1]
container=f'pbp-flw-settlement-test-{os.getpid()}'
def uid():return str(uuid.uuid4())
def pg(sql,check=True):
 r=subprocess.run(['docker','exec','-i',container,'psql','-U','postgres','-d','pbp','-Atq','-v','ON_ERROR_STOP=1'],input=sql,text=True,capture_output=True)
 if check and r.returncode:raise AssertionError(r.stderr)
 return r.stdout.strip() if check else r
try:
 subprocess.run(['docker','run','-d','--name',container,'-e','POSTGRES_PASSWORD=disposable-test-only','-e','POSTGRES_DB=pbp','postgres:17-alpine'],check=True,capture_output=True)
 for _ in range(60):
  if subprocess.run(['docker','exec',container,'pg_isready','-h','127.0.0.1','-U','postgres'],capture_output=True).returncode==0:break
  time.sleep(.2)
 else:raise AssertionError('Disposable database unavailable')
 pg((root/'tests/local_supabase_stub.sql').read_text())
 for path in sorted((root/'migrations').glob('*.sql')):pg(path.read_text())
 pg((root/'seed.sql').read_text())
 actor=uid();merchant=pg('select id from merchants limit 1');stamp=pg(f"select updated_at from merchants where id='{merchant}'")
 pg(f"update merchants set paystack_subaccount='ACCT_retained' where id='{merchant}'")
 assert pg("select has_table_privilege('authenticated','flutterwave_payout_setups','SELECT')")=='f'
 assert pg("select has_table_privilege('service_role','flutterwave_payout_setups','SELECT')")=='t'
 assert pg("select has_function_privilege('anon','admin_begin_flutterwave_payout(uuid,uuid,text,uuid,text,text,text,text,text,numeric,timestamptz)','EXECUTE')")=='f'
 def begin(mode='live',fingerprint='a'*64):
  return pg(f"select admin_begin_flutterwave_payout('{actor}','{merchant}','{mode}','{uid()}','{fingerprint}','044','Fixture Bank','6789','FIXTURE STORES',0,'{stamp}')")
 with ThreadPoolExecutor(4) as pool:claims=list(pool.map(lambda _:json.loads(begin()),range(4)))
 assert sum(v['claimed'] for v in claims)==1,'multiple provider POST claims granted'
 request=claims[0]['setup']['request_id']
 assert all(v['setup']['request_id']==request for v in claims),'retry changed durable request'
 assert pg(f"select admin_begin_flutterwave_payout('{actor}','{merchant}','live','{uid()}',repeat('b',64),'044','Fixture Bank','6789','OTHER BANK',0,'{stamp}')",False).returncode,'different bank replaced pending setup'
 assert pg(f"select admin_set_flutterwave_subaccount('{actor}','{merchant}','live','RS_override','{stamp}')",False).returncode,'manual import overrode in-flight creation'
 assert pg(f"select admin_complete_flutterwave_payout('{actor}','{merchant}','live','{uid()}','RS_forged',2181)",False).returncode,'other request completed setup'
 pg(f"update flutterwave_payout_setups set status='needs_review',provider_id=2181 where merchant_id='{merchant}' and domain='live'")
 assert not json.loads(begin())['claimed'],'uncertain response allowed duplicate creation'
 assert pg(f"select admin_complete_flutterwave_payout('{actor}','{merchant}','live','{request}','RS_changed',9999)",False).returncode,'different numeric upstream ID accepted'
 pg(f"select admin_complete_flutterwave_payout('{actor}','{merchant}','live','{request}','RS_liveFixture',2181)")
 pg(f"select admin_complete_flutterwave_payout('{actor}','{merchant}','live','{request}','RS_liveFixture',2181)")
 assert pg(f"select flutterwave_subaccount||':'||paystack_subaccount from merchants where id='{merchant}'")=='RS_liveFixture:ACCT_retained'
 assert pg("select count(*) from admin_audit where action='merchant.flutterwave_payout_created.live'")=='1','duplicate completion audit'
 # Sandbox provisioning has its own durable claim and never replaces live recipient.
 stamp=pg(f"select updated_at from merchants where id='{merchant}'")
 sandbox=json.loads(begin('test'));assert sandbox['claimed']
 pg(f"select admin_complete_flutterwave_payout('{actor}','{merchant}','test','{sandbox['setup']['request_id']}','RS_testFixture',2181)")
 assert pg(f"select flutterwave_subaccount||':'||flutterwave_test_subaccount from merchants where id='{merchant}'")=='RS_liveFixture:RS_testFixture'
 other=uid();pg(f"select admin_save_merchant('{actor}','{other}','Other merchant',null,null,null,null,null)")
 other_stamp=pg(f"select updated_at from merchants where id='{other}'")
 assert pg(f"select admin_set_flutterwave_subaccount('{actor}','{other}','live','RS_liveFixture','{other_stamp}')",False).returncode,'same live receiving subaccount assigned to another merchant'
 assert pg(f"select admin_begin_flutterwave_payout('{actor}','{other}','live','{uid()}',repeat('c',64),'044','Fixture','1234','Other',0,'2000-01-01')",False).returncode,'stale merchant update accepted'
 assert pg(f"select admin_begin_flutterwave_payout('{actor}','{other}','live','{uid()}',repeat('c',64),'044','Fixture','1234','Other',0.001,'{other_stamp}')",False).returncode,'fractional basis point accepted'
 print('PASS: full schema, live provisioning claim races, durable retries, uncertain recovery, request/recipient integrity, separate sandbox destination, Paystack preservation, audit idempotency and private grants. No provider HTTP.')
finally:subprocess.run(['docker','rm','-f',container],capture_output=True)
