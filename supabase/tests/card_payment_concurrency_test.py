"""Direct-card claims against isolated Postgres, no provider requests."""
import concurrent.futures
import subprocess
import sys
import uuid
import time
container = sys.argv[1]
if not container.startswith('pbp-'):
    raise SystemExit('Use an isolated pbp-* container')
def pg(sql, check=True):
    r = subprocess.run(['docker','exec','-i',container,'psql','-U','postgres','-d','pbp','-At','-v','ON_ERROR_STOP=1'], input=sql,text=True,capture_output=True)
    if check and r.returncode:
        raise AssertionError(r.stderr)
    return r
payer, card = str(uuid.uuid4()), str(uuid.uuid4())
pg(f"insert into auth.users(id,email,raw_user_meta_data) values('{payer}','{payer}@example.test','{{\"full_name\":\"Card race\",\"phone\":\"08099990021\"}}');"
   f"update profiles set palm_enrolled=true where id='{payer}';"
   f"insert into linked_cards(id,user_id,signature_hash,authorization_ciphertext,bank,brand,last4,exp_month,exp_year,is_default) values('{card}','{payer}',repeat('d',64),'cipher','Test','visa','4081','12','2098',true);"
   f"insert into card_link_attempts(user_id,request_id,reference,email,domain,status,card_id) values('{payer}',gen_random_uuid(),'race-card-link','{payer}@example.test','test','verified','{card}');")
terminal = pg('select id from terminals limit 1;').stdout.strip()
def create():
    txn=pg(f"select id from create_terminal_transaction('{terminal}',gen_random_uuid(),5000,'Race');").stdout.strip()
    pg(f"update transactions set status='authenticated',matched_user_id='{payer}',match_score=92,match_mode='search',payment_card_id='{card}' where id='{txn}';")
    return txn
def claim(txn):
    return pg(f"select count(*) from begin_card_payment('{txn}','{terminal}','test',60,85);",False)
with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
    txn=create()
    claims=list(pool.map(claim,[txn]*4))
    assert all(r.returncode==0 for r in claims)
    assert sum(int(r.stdout.strip()) for r in claims)==1,'multiple charge POST claims granted'
    assert pg(f"select count(*) from card_payment_attempts where transaction_id='{txn}';").stdout.strip()=='1'
    for _ in range(5):
        txn=create()
        a=pool.submit(claim,txn)
        b=pool.submit(pg,f"update transactions set status='cancelled' where id='{txn}' and status='authenticated';",False)
        a.result(); b.result()
        state=pg(f"select status||':'||(select count(*) from card_payment_attempts where transaction_id='{txn}') from transactions where id='{txn}';").stdout.strip()
        assert state in ('cancelled:0','processing:1'),f'unsafe cancellation race: {state}'
print('Direct-card concurrent claims and cancellation races: passed')

# Freshness is checked after acquiring the card lock, not before waiting on it.
txn=create()
holder=subprocess.Popen(['docker','exec','-i',container,'psql','-U','postgres','-d','pbp','-At','-v','ON_ERROR_STOP=1'],stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
holder.stdin.write(f"begin; select pg_advisory_xact_lock(hashtextextended('cards:{payer}',0)); select 'LOCKED'; select pg_sleep(5); commit;\n")
holder.stdin.close()
while holder.stdout.readline().strip() != 'LOCKED':
    if holder.poll() is not None:
        raise AssertionError('Card lock fixture failed')
expired=pg(f"select count(*) from begin_card_payment('{txn}','{terminal}','test',3,85);",False)
holder.wait(timeout=10)
assert expired.returncode!=0 and 'palm authorization expired' in expired.stderr,'expired palm charged after lock wait'
assert pg(f"select count(*) from card_payment_attempts where transaction_id='{txn}';").stdout.strip()=='0'
print('Direct-card authorization expiry after card lock wait: passed')
