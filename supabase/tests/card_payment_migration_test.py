"""Migration 0018 regression checks in a disposable database; never hosted Supabase."""
import os
from pathlib import Path
import subprocess
import time

root = Path(__file__).resolve().parents[1]
container = f'pbp-card-migration-{os.getpid()}'

def pg(sql):
    result = subprocess.run(['docker','exec','-i',container,'psql','-U','postgres','-d','pbp','-v','ON_ERROR_STOP=1','-q'],input=sql,text=True,capture_output=True)
    if result.returncode:
        raise AssertionError(result.stderr)

migration = (root/'migrations/0018_card_payments.sql').read_text()
try:
    subprocess.run(['docker','run','-d','--name',container,'-e','POSTGRES_PASSWORD=pbp','-e','POSTGRES_DB=pbp','postgres:17-alpine'],check=True,capture_output=True)
    for _ in range(60):
        if subprocess.run(['docker','exec',container,'pg_isready','-U','postgres'],capture_output=True).returncode == 0:
            break
        time.sleep(0.5)
    pg((root/'tests/local_supabase_stub.sql').read_text())
    for path in sorted((root/'migrations').glob('*.sql')):
        if path.name >= '0018':
            break
        pg(path.read_text())
    pg((root/'seed.sql').read_text())
    pg("insert into public.terminals(merchant_id,label,api_key_hash) select id,'Migration test',repeat('e',64) from public.merchants limit 1;")
    pg(migration)
    pg(migration)
    pg((root/'tests/card_payment_test.sql').read_text())
    print('PASS: baseline migration, safe rerun and direct-card invariants', flush=True)
    pg('drop function public.post_transaction(uuid,integer); drop function public.post_topup(uuid,bigint,text);')
    pg(migration)
    print('PASS: migration when both legacy functions are absent', flush=True)
    pg('''create function public.post_transaction(uuid) returns uuid language sql as 'select $1';
create function public.post_topup(uuid,integer) returns uuid language sql as 'select $1';
grant execute on function public.post_transaction(uuid),public.post_topup(uuid,integer) to anon,authenticated,service_role;''')
    pg(migration)
    pg('''do $$ declare r record; who text; begin
 for r in select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('post_transaction','post_topup') loop
  foreach who in array array['anon','authenticated','service_role'] loop
   assert not has_function_privilege(who,r.oid,'EXECUTE'),'legacy overload still callable';
  end loop;
 end loop;
 assert (select count(*) from public.merchants)=1,'migration removed merchant data';
 assert has_function_privilege('service_role','public.begin_card_payment(uuid,uuid,text,integer,integer)','EXECUTE'),'direct-card RPC lost service permission';
end $$;''')
    print('PASS: alternate overloads revoked for all application roles; existing data retained', flush=True)
finally:
    subprocess.run(['docker','rm','-f',container],capture_output=True)
