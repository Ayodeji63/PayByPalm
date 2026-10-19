"""Card mode backfill and isolation in disposable Postgres; never hosted Supabase."""
import os
from pathlib import Path
import subprocess
import time
root = Path(__file__).resolve().parents[1]
container = f'pbp-payment-modes-{os.getpid()}'
def pg(sql):
    result = subprocess.run(['docker','exec','-i',container,'psql','-U','postgres','-d','pbp','-v','ON_ERROR_STOP=1','-q'],input=sql,text=True,capture_output=True)
    if result.returncode:
        raise AssertionError(result.stderr)
try:
    subprocess.run(['docker','run','-d','--name',container,'-e','POSTGRES_PASSWORD=disposable','-e','POSTGRES_DB=pbp','postgres:17-alpine'],check=True,capture_output=True)
    for _ in range(60):
        if subprocess.run(['docker','exec',container,'pg_isready','-U','postgres'],capture_output=True).returncode == 0:
            break
        time.sleep(0.5)
    pg((root/'tests/local_supabase_stub.sql').read_text())
    for path in sorted((root/'migrations').glob('*.sql')):
        if path.name < '0022': pg(path.read_text())
    pg((root/'seed.sql').read_text())
    pg("insert into public.terminals(merchant_id,label,api_key_hash) select id,'Mode fixture',repeat('e',64) from public.merchants limit 1;")
    for n in range(1,5):
        user=f'9a000000-0000-4000-8000-{n:012d}'
        card=f'9b000000-0000-4000-8000-{n:012d}'
        pg(f"""insert into auth.users(id,email,raw_user_meta_data) values('{user}','legacy-{n}@example.test','{{"full_name":"Legacy Fixture","phone":"0808800000{n}"}}'); insert into public.linked_cards(id,user_id,signature_hash,authorization_ciphertext,bank,brand,last4,exp_month,exp_year,is_default) values('{card}','{user}',repeat('{n}',64),'encrypted','Legacy Bank','visa','1234','12','2099',true);""")
        modes=['test'] if n==1 else ['live'] if n==2 else ['test','live'] if n==3 else []
        for mode in modes:
            pg(f"insert into public.card_link_attempts(user_id,request_id,reference,email,domain,status,card_id) values('{user}',gen_random_uuid(),'legacy-{n}-{mode}','legacy-{n}@example.test','{mode}','verified','{card}');")
    migration=(root/'migrations/0022_payment_modes.sql').read_text()
    pg(migration);pg(migration)
    pg("""do $$ begin
    assert (select domain from public.linked_cards where last4='1234' and signature_hash=repeat('1',64))='test','test backfill failed';
    assert (select domain from public.linked_cards where signature_hash=repeat('2',64))='live','live backfill failed';
    assert (select domain is null from public.linked_cards where signature_hash=repeat('3',64)),'ambiguous legacy card promoted';
    assert (select domain is null from public.linked_cards where signature_hash=repeat('4',64)),'unverified legacy card promoted';
    assert (select count(*) from public.linked_cards)=4,'legacy data lost';
    end $$;""")
    pg((root/'tests/payment_modes_test.sql').read_text())
    pg("delete from public.card_link_attempts where reference like 'legacy-%'; delete from public.linked_cards where bank='Legacy Bank'; delete from auth.users where email like 'legacy-%@example.test';")
    pg((root/'tests/card_link_test.sql').read_text())
    pg((root/'tests/card_payment_test.sql').read_text())
    print('PASS: mode migration/rerun, verified backfill, ambiguous quarantine, per-mode defaults/checkouts/signatures, live charge binding, ownership and retained card invariants',flush=True)
finally:
    subprocess.run(['docker','rm','-f',container],capture_output=True)
