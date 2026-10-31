"""Real database isolation/race tests. Disposable Docker PostgreSQL; no payment HTTP."""
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
import os
import subprocess
import time
import uuid

root = Path(__file__).resolve().parents[1]
container = f'pbp-ccnet-test-{os.getpid()}'
def pg(sql, check=True):
    result = subprocess.run(['docker','exec','-i',container,'psql','-U','postgres','-d','pbp','-Atq','-v','ON_ERROR_STOP=1'], input=sql,text=True,capture_output=True)
    if check and result.returncode: raise AssertionError(result.stderr)
    return result.stdout.strip() if check else result

def uid(): return str(uuid.uuid4())
try:
    subprocess.run(['docker','run','-d','--name',container,'-e','POSTGRES_PASSWORD=disposable-test-only','-e','POSTGRES_DB=pbp','postgres:17-alpine'],check=True,capture_output=True)
    for _ in range(60):
        if subprocess.run(['docker','exec',container,'pg_isready','-h','127.0.0.1','-U','postgres'],capture_output=True).returncode==0: break
        time.sleep(0.2)
    else:
        raise AssertionError('Disposable PostgreSQL did not become ready')
    pg((root/'tests/local_supabase_stub.sql').read_text())
    for path in sorted((root/'migrations').glob('*.sql')):
        if path.name.startswith('0027'): break
        pg(path.read_text())
    pg((root/'seed.sql').read_text())
    user,terminal,card,legacy = uid(),uid(),uid(),uid()
    pg(f'''insert into pbp_auth."user"(id,name,email,"emailVerified",phone,disabled) values('{user}','CCNet Test','{user}@example.invalid',true,'08077770001',false);
    insert into terminals(id,merchant_id,label,api_key_hash) select '{terminal}',id,'CCNet test',repeat('b',64) from merchants limit 1;
    insert into palm_bindings(id,user_id,tencent_palm_id) values('{legacy}','{user}','retained-tencent-history');
    update profiles set palm_enrolled=true where id='{user}';''')
    pg((root/'migrations/0027_ccnet_provider.sql').read_text())
    pg((root/'migrations/0028_live_operations_and_retakes.sql').read_text())
    pg((root/'migrations/0029_ccnet_checkout_threshold.sql').read_text())
    assert pg(f"select provider||':'||provider_subject_id from palm_bindings where id='{legacy}'")=='tencent:retained-tencent-history'
    assert pg("select has_function_privilege('anon','reserve_ccnet_enrolment(uuid,uuid,uuid,text,text,uuid)','EXECUTE')")=='f'
    assert pg("select has_function_privilege('service_role','begin_card_payment_previous(uuid,uuid,text,integer,integer)','EXECUTE')")=='f'
    def session():
        s=uid();pg(f"insert into enrol_sessions(id,terminal_id,user_id,status,expires_at,provider) values('{s}','{terminal}','{user}','claimed',clock_timestamp()+interval '5 minutes','ccnet');");return s
    rejected=session(); rejected_owner=uid()
    pg(f"select reserve_ccnet_enrolment('{rejected}','{terminal}','{user}',repeat('e',64),'right','{rejected_owner}')")
    assert pg(f"select reset_rejected_ccnet_capture('{rejected}','{uid()}',repeat('e',64))")=='f','another attempt reset the lease'
    assert pg(f"select reset_rejected_ccnet_capture('{rejected}','{rejected_owner}',repeat('e',64))")=='t'
    assert pg(f"select status||':'||(capture_fingerprint is null)::text from enrol_sessions where id='{rejected}'")=='claimed:true'
    # A different set of captures is now allowed without another phone claim.
    retry_owner=uid()
    pg(f"select reserve_ccnet_enrolment('{rejected}','{terminal}','{user}',repeat('f',64),'left','{retry_owner}')")
    pg(f"select reset_rejected_ccnet_capture('{rejected}','{retry_owner}',repeat('f',64))")
    assert pg("select has_table_privilege('authenticated','public.operation_events','SELECT')")=='f'
    assert pg("select has_function_privilege('anon','public.append_operation_events(jsonb)','EXECUTE')")=='f'
    pg("select append_operation_events('[{\"operation_id\":\"11111111-1111-4111-8111-111111111111\",\"request_id\":\"22222222-2222-4222-8222-222222222222\",\"operation\":\"capture\",\"stage\":\"frame_captured\",\"state\":\"observed\",\"occurred_at\":\"2026-10-30T12:00:00Z\",\"details\":{\"frameCount\":3,\"imagesB64\":\"must-not-persist\"}}]')")
    assert pg("select details::text from operation_events limit 1")== '{"frameCount": 3}'
    s=session(); owner=uid()
    def reserve(owner): return pg(f"select reserve_ccnet_enrolment('{s}','{terminal}','{user}',repeat('a',64),'right','{owner}');",False)
    with ThreadPoolExecutor(2) as pool:
        results=list(pool.map(reserve,[owner,uid()]))
    assert sum(r.returncode==0 for r in results)==1,'concurrent reservation must have one winner'
    owner=pg(f"select registration_owner from enrol_sessions where id='{s}'")
    changed=pg(f"select reserve_ccnet_enrolment('{s}','{terminal}','{user}',repeat('b',64),'right','{uid()}');",False)
    assert changed.returncode and 'retry requires original captures' in changed.stderr
    pg(f"select complete_ccnet_enrolment('{s}','{terminal}','{user}',repeat('a',64),'{owner}');")
    assert pg(f"select reserve_ccnet_enrolment('{s}','{terminal}','{user}',repeat('a',64),'right','{uid()}')")=='completed'
    assert pg(f"select count(*) from palm_bindings where user_id='{user}' and revoked_at is null")=='2','Tencent history must coexist with CCNet'
    binding=pg(f"select id from palm_bindings where user_id='{user}' and provider='ccnet'")
    other=session()
    assert pg(f"select reserve_ccnet_enrolment('{other}','{terminal}','{user}',repeat('c',64),'left','{uid()}');",False).returncode,'second session must not overwrite completed enrollment'
    # Verified test-domain card fixtures; no provider network calls.
    pg(f"insert into linked_cards(id,user_id,domain,signature_hash,authorization_ciphertext,bank,brand,last4,exp_month,exp_year,is_default) values('{card}','{user}','test',repeat('c',64),'test-cipher','Test','visa','1234','12','2098',true);")
    pg(f"insert into card_link_attempts(user_id,request_id,reference,email,domain,status,card_id) values('{user}',gen_random_uuid(),'ccnet-card-link','test@example.invalid','test','verified','{card}');")
    def transaction(provider='ccnet', reference=binding, score=50):
        t=pg(f"select id from create_terminal_transaction('{terminal}',gen_random_uuid(),5000,'CCNet test')")
        pg(f"update transactions set status='authenticated',matched_user_id='{user}',match_score={score},match_mode='search',payment_card_id='{card}',palm_provider='{provider}',palm_binding_id='{reference}' where id='{t}';")
        return t
    def claim(t): return pg(f"select count(*) from begin_card_payment('{t}','{terminal}','test',60,50)",False)
    # Both the authentication transition and charge claim enforce the 50 floor.
    for score in (49,):
        rejected=pg(f"select id from create_terminal_transaction('{terminal}',gen_random_uuid(),5000,'threshold rejection')")
        result=pg(f"update transactions set status='authenticated',matched_user_id='{user}',match_score={score},match_mode='search',payment_card_id='{card}',palm_provider='ccnet',palm_binding_id='{binding}' where id='{rejected}'",False)
        assert result.returncode, 'database accepted authentication below 50'
    for score in (50,51,84):
        accepted=transaction(score=score)
        claimed=claim(accepted)
        assert claimed.returncode==0 and claimed.stdout.strip()=='1',f'charge claim rejected score {score} at minimum 50: {claimed.stderr}'
    stricter=transaction(score=50)
    assert pg(f"select count(*) from begin_card_payment('{stricter}','{terminal}','test',60,51)",False).returncode,'caller threshold was ignored'
    t=transaction()
    with ThreadPoolExecutor(4) as pool: claims=list(pool.map(claim,[t]*4))
    assert all(r.returncode==0 for r in claims) and sum(int(r.stdout.strip()) for r in claims)==1,'double Pay granted multiple charge claims'
    historical=transaction('tencent',legacy,99)
    assert claim(historical).returncode,'historical authentication charged a new CCNet checkout'
    pending=transaction()
    pg(f"select revoke_ccnet_palms('{user}');")
    assert claim(pending).returncode,'revoked binding authorized charge'
    assert pg(f"select revoked_at is null from palm_bindings where id='{legacy}'")=='t','Tencent history revoked'
    assert pg(f"select count(*) from begin_card_payment('{t}','{terminal}','test',60,50)")=='0','existing attempt recovery acquired second POST claim'
    pg(f"select finish_card_payment((select reference from card_payment_attempts where transaction_id='{t}'),'success','123456789');")
    assert pg(f"select status from transactions where id='{t}'")=='settled','processing recovery broken by revocation'
    # Re-enrollment isolates a new subject and never resurrects the old authentication.
    newer=session(); new_owner=uid()
    pg(f"select reserve_ccnet_enrolment('{newer}','{terminal}','{user}',repeat('d',64),'left','{new_owner}'); select complete_ccnet_enrolment('{newer}','{terminal}','{user}',repeat('d',64),'{new_owner}');")
    assert claim(pending).returncode,'replacement authorized old authentication'
    assert pg(f"select count(*) from palm_bindings where user_id='{user}' and provider='ccnet'")=='2'
    # Revocation committed while a claim waits must win.
    new_binding=pg(f"select id from palm_bindings where user_id='{user}' and provider='ccnet' and revoked_at is null")
    raced=transaction(reference=new_binding)
    holder=subprocess.Popen(['docker','exec','-i',container,'psql','-U','postgres','-d','pbp','-Atq','-v','ON_ERROR_STOP=1'],stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
    holder.stdin.write(f"begin; select revoke_ccnet_palms('{user}'); select 'LOCKED'; select pg_sleep(1); commit;\n");holder.stdin.close()
    while holder.stdout.readline().strip()!='LOCKED':
        if holder.poll() is not None: raise AssertionError('revocation fixture failed')
    result=claim(raced);holder.wait(timeout=10)
    assert result.returncode,'claim ignored committed revocation after lock wait'
    assert pg(f"select count(*) from card_payment_attempts where transaction_id='{raced}'")=='0'
    print('PASS: full migration, Tencent preservation, enrollment retries/races, strict binding claims, double Pay, revocation/replacement and processing recovery')
finally:
    subprocess.run(['docker','rm','-f',container],capture_output=True)
