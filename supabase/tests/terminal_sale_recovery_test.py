"""Terminal sale repair regression checks; disposable Postgres only."""
import os
from pathlib import Path
import subprocess
import time

root = Path(__file__).resolve().parents[1]
container = f'pbp-sale-repair-{os.getpid()}'

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
    repair = (root/'migrations/0019_terminal_sale_recovery.sql').read_text()
    pg(repair)
    pg(repair)
    pg((root/'tests/card_payment_test.sql').read_text())
    print('PASS: fresh install, idempotent repair and direct-card invariants', flush=True)
    pg("""drop function public.create_terminal_transaction(uuid,uuid,bigint,text);
    drop trigger payment_transition_guard on public.transactions;
    alter table public.transactions drop column sale_id;""")
    pg(repair)
    pg(repair)
    pg((root/'tests/card_payment_test.sql').read_text())
    print('PASS: missing sale column/RPC/trigger repaired; direct-card and no-ledger invariants preserved', flush=True)

finally:
    subprocess.run(['docker','rm','-f',container],capture_output=True)
