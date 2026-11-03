"""Provider switching invariants against disposable PostgreSQL; no payment HTTP."""
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
import os,subprocess,time,uuid
root=Path(__file__).resolve().parents[1]
container=f'pbp-provider-test-{os.getpid()}'
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
 for p in sorted((root/'migrations').glob('*.sql')):pg(p.read_text())
 pg((root/'seed.sql').read_text())
 user,terminal,session,owner=uid(),uid(),uid(),uid()
 pg(f'''insert into pbp_auth."user"(id,name,email,"emailVerified",phone,disabled) values('{user}','Provider fixture','{user}@example.invalid',true,'08077770001',false);
 insert into terminals(id,merchant_id,label,api_key_hash) select '{terminal}',id,'Provider fixture',repeat('b',64) from merchants limit 1;
 insert into enrol_sessions(id,terminal_id,user_id,status,expires_at,provider) values('{session}','{terminal}','{user}','claimed',clock_timestamp()+interval '5 minutes','ccnet');
 select reserve_ccnet_enrolment('{session}','{terminal}','{user}',repeat('a',64),'left','{owner}');
 select complete_ccnet_enrolment('{session}','{terminal}','{user}',repeat('a',64),'{owner}');''')
 binding=pg(f"select id from palm_bindings where user_id='{user}' and provider='ccnet' and revoked_at is null")
 cards={}
 for provider in ['paystack','flutterwave']:
  card=uid();cards[provider]=card
  pg(f"insert into linked_cards(id,user_id,domain,provider,signature_hash,authorization_ciphertext,bank,brand,last4,exp_month,exp_year,is_default,credential_expires_at) values('{card}','{user}','test','{provider}',repeat('c',64),'test-cipher','Fixture','visa','1234','12','2098',true,clock_timestamp()+interval '1 year');")
  pg(f"insert into card_link_attempts(user_id,request_id,reference,email,domain,provider,amount_minor,status,card_id) values('{user}','{owner}','fixture-{provider}','{user}@example.invalid','test','{provider}',{10000 if provider=='flutterwave' else 5000},'verified','{card}')")
 assert pg(f"select count(*) from linked_cards where user_id='{user}' and is_default")=='2','provider defaults collide'
 pg(f"select edit_linked_card('{user}','{cards['flutterwave']}','default')")
 assert pg(f"select count(*) from linked_cards where user_id='{user}' and is_default")=='2','editing Flutterwave cleared Paystack default'
 assert pg(f"update linked_cards set provider='paystack' where id='{cards['flutterwave']}'",False).returncode,'card provider mutation allowed'
 assert pg("select has_function_privilege('authenticated','begin_provider_card_payment(uuid,uuid,text,integer,integer,text)','EXECUTE')")=='f'
 def transaction(provider):
  t=pg(f"select id from create_terminal_transaction('{terminal}',gen_random_uuid(),5000,'Provider test')")
  pg(f"update transactions set status='authenticated',matched_user_id='{user}',match_score=75,match_mode='search',payment_card_id='{cards[provider]}',palm_provider='ccnet',palm_binding_id='{binding}',payment_provider='{provider}',payment_domain='test' where id='{t}'")
  return t
 def claim(t,provider='flutterwave'):
  return pg(f"select count(*) from begin_provider_card_payment('{t}','{terminal}','test',60,50,'{provider}')",False)
 flw=transaction('flutterwave')
 assert pg(f"select count(*) from begin_provider_card_payment('{flw}','{terminal}','live',60,50,'flutterwave')",False).returncode,'mode switch accepted stale authentication'
 assert claim(flw,'paystack').returncode,'provider switch accepted stale authentication'
 assert pg(f"select count(*) from begin_card_payment('{flw}','{terminal}','test',60,50)",False).returncode,'legacy charge accepted Flutterwave card'
 assert pg(f"update transactions set payment_provider='paystack' where id='{flw}'",False).returncode,'authentication provider mutable'
 with ThreadPoolExecutor(4) as pool:results=list(pool.map(lambda _:claim(flw),range(4)))
 assert all(r.returncode==0 for r in results) and sum(int(r.stdout.strip()) for r in results)==1,'double Pay claimed duplicate POST'
 ps=transaction('paystack');assert claim(ps,'paystack').stdout.strip()=='1'
 # Same numeric upstream IDs are independent across providers, while each sale settles once.
 for t in [flw,ps]:pg(f"select finish_card_payment((select reference from card_payment_attempts where transaction_id='{t}'),'success','12345')")
 assert pg(f"select count(*) from transactions where id in ('{flw}','{ps}') and status='settled'")=='2'
 expired=transaction('flutterwave')
 pg(f"update linked_cards set credential_expires_at=clock_timestamp()-interval '1 second' where id='{cards['flutterwave']}'")
 assert claim(expired).returncode,'expired token charged'
 pg(f"update linked_cards set credential_expires_at=clock_timestamp()+interval '1 year' where id='{cards['flutterwave']}'")
 revoked=transaction('flutterwave');pg(f"select revoke_ccnet_palms('{user}')")
 assert claim(revoked).returncode,'revocation ignored'
 assert claim(flw,'paystack').stdout.strip()=='0','existing claim acquired a second POST after switch'
 # Exercise the real completion RPC, not just direct card fixtures.
 link=uid();lease=uid()
 pg(f"insert into card_link_attempts(user_id,request_id,reference,email,domain,provider,amount_minor,status) values('{user}','{link}','pbp_card_'||replace('{link}','-',''),'{user}@example.invalid','test','flutterwave',10000,'pending')")
 reference='pbp_card_'+link.replace('-','')
 pg(f"select claim_card_link('{reference}','{lease}')")
 import json
 card_data={'signature_hash':'d'*64,'authorization_ciphertext':'fixture-cipher-only','bank':'Fixture','brand':'visa','last4':'5678','exp_month':'12','exp_year':'2098','credential_expires_at':'2000-01-01T00:00:00Z'}
 assert pg(f"select complete_card_link('{reference}','{lease}','{json.dumps(card_data)}'::jsonb,'456')",False).returncode,'expired token linked'
 card_data['credential_expires_at']=pg("select clock_timestamp()+interval '1 year'")
 pg(f"select complete_card_link('{reference}','{lease}','{json.dumps(card_data)}'::jsonb,'456')")
 assert pg(f"select l.provider||':'||l.domain||':'||(l.credential_expires_at>clock_timestamp())::text from linked_cards l join card_link_attempts a on a.card_id=l.id where a.reference='{reference}'")=='flutterwave:test:true'
 assert pg(f"insert into card_link_attempts(user_id,request_id,reference,email,domain,provider,amount_minor) values('{user}',gen_random_uuid(),'wrong-amount','fixture@example.invalid','test','flutterwave',5000)",False).returncode,'Flutterwave verification price not enforced'
 merchant=pg('select id from merchants limit 1');stamp=pg(f"select updated_at from merchants where id='{merchant}'")
 pg(f"select admin_set_flutterwave_subaccount('{user}','{merchant}','test','RS_fixture','{stamp}')")
 assert pg(f"select flutterwave_test_subaccount from merchants where id='{merchant}'")=='RS_fixture'
 assert pg(f"select admin_set_flutterwave_subaccount('{user}','{merchant}','live','RS_wrong','{stamp}')",False).returncode,'stale admin write accepted'
 assert pg("select count(*) from admin_audit where action='merchant.flutterwave_subaccount.test'")=='1'
 print('PASS: full schema, provider/mode isolation, separate defaults, immutable authentication, NO duplicate Pay claims, token expiry, revocation, recovery and audited merchant setup. No payment HTTP.')
finally:subprocess.run(['docker','rm','-f',container],capture_output=True)
