"""Payment races against an isolated Docker Postgres fixture, never production."""
import concurrent.futures
import subprocess
import sys
import time
import uuid

container = sys.argv[1]
if not container.startswith('pbp-'):
    raise SystemExit('Use an isolated pbp-* test container.')

def pg(sql, check=True):
    result = subprocess.run(
        ['docker', 'exec', '-i', container, 'psql', '-U', 'postgres', '-d', 'pbp',
         '-At', '-v', 'ON_ERROR_STOP=1', '-v', 'VERBOSITY=verbose'],
        input=sql, text=True, capture_output=True,
    )
    if check and result.returncode:
        raise AssertionError(result.stderr)
    return result

payer = str(uuid.uuid4())
pg(f"insert into auth.users(id,email,raw_user_meta_data) values ('{payer}','{payer}@test',"
   f"'{{\"full_name\":\"Concurrent Payer\",\"phone\":\"08010009999\"}}');"
   f"select public.post_topup('{payer}',1000,'Test funding');")
terminal = pg('select id from public.terminals limit 1;').stdout.strip()
account = pg(f"select id from public.accounts where user_id='{payer}';").stdout.strip()

def create(sale, amount):
    return pg(f"select id from public.create_terminal_transaction('{terminal}','{sale}',{amount},'Race');").stdout.strip()

def authorize(transaction):
    pg(f"update public.transactions set status='authenticated',matched_user_id='{payer}',"
       f"match_score=92,match_mode='search' where id='{transaction}';")

with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
    sale = str(uuid.uuid4())
    futures = [pool.submit(create, sale, 100) for _ in range(2)]
    ids = [f.result() for f in futures]
    assert ids[0] == ids[1], 'Concurrent initiation created duplicate sales'
    authorize(ids[0])
    confirmations = [pool.submit(pg, f"select id from public.post_transaction('{ids[0]}');") for _ in range(2)]
    assert all(f.result().stdout.strip() == ids[0] for f in confirmations)
    assert pg(f"select count(*) from public.ledger_entries where transaction_id='{ids[0]}';").stdout.strip() == '2'
print('Concurrent creation and confirmation: passed')

# Exactly one of two 600-kobo payments may spend the remaining 900 kobo.
with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
    ids = [create(str(uuid.uuid4()), 600) for _ in range(2)]
    for transaction in ids:
        authorize(transaction)
    futures = [pool.submit(pg, f"select id from public.post_transaction('{transaction}');", False) for transaction in ids]
    results = [f.result() for f in futures]
    assert sum(r.returncode == 0 for r in results) == 1, 'Concurrent spends exceeded balance'
    assert any('PB003' in r.stderr for r in results), 'Loser did not receive insufficient funds'
assert pg(f"select public.balance_of('{account}');").stdout.strip() == '300'
print('Concurrent spending without overdraft: passed')

# Expiry must be rechecked after waiting for a payer-account lock.
transaction = create(str(uuid.uuid4()), 100)
authorize(transaction)
holder = subprocess.Popen(
    ['docker', 'exec', '-i', container, 'psql', '-U', 'postgres', '-d', 'pbp', '-At', '-v', 'ON_ERROR_STOP=1'],
    stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True,
)
holder.stdin.write(f"set application_name='pbp-expiry-lock'; begin; select id from public.accounts where id='{account}' for update; select pg_sleep(3); commit;\n")
holder.stdin.close()
try:
    for _ in range(30):
        sleeping = pg("select count(*) from pg_stat_activity where application_name='pbp-expiry-lock' and wait_event='PgSleep';").stdout.strip()
        if sleeping == '1':
            break
        time.sleep(0.05)
    else:
        raise AssertionError('Lock holder did not start')
    result = pg(f"select id from public.post_transaction('{transaction}',1);", False)
    assert result.returncode != 0 and 'PB006' in result.stderr, result.stdout + result.stderr
    assert pg(f"select count(*) from public.ledger_entries where transaction_id='{transaction}';").stdout.strip() == '0'
finally:
    holder.wait(timeout=10)
    assert holder.returncode == 0, holder.stderr.read()
print('Authorization expiry after lock wait: passed')
