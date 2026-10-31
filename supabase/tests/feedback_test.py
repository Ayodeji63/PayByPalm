"""Disposable PostgreSQL only: feedback isolation, publication reset and update races."""
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
import os
import subprocess
import time
import uuid
root=Path(__file__).resolve().parents[1]
container=f'pbp-feedback-test-{os.getpid()}'
def pg(sql,check=True):
    r=subprocess.run(['docker','exec','-i',container,'psql','-U','postgres','-d','pbp','-Atq','-v','ON_ERROR_STOP=1'],input=sql,text=True,capture_output=True)
    if check and r.returncode: raise AssertionError(r.stderr)
    return r.stdout.strip() if check else r
try:
    subprocess.run(['docker','run','-d','--name',container,'-e','POSTGRES_PASSWORD=disposable-test-only','-e','POSTGRES_DB=pbp','postgres:17-alpine'],check=True,capture_output=True)
    for _ in range(60):
        if subprocess.run(['docker','exec',container,'pg_isready','-U','postgres'],capture_output=True).returncode==0:break
        time.sleep(.2)
    else:raise AssertionError('Test database unavailable')
    pg((root/'tests/local_supabase_stub.sql').read_text())
    for path in sorted((root/'migrations').glob('*.sql')):pg(path.read_text())
    owner,actor=str(uuid.uuid4()),str(uuid.uuid4())
    for n,user in enumerate([owner,actor]):
        pg(f'''insert into pbp_auth."user"(id,name,email,"emailVerified",phone,disabled) values('{user}','Feedback fixture','{user}@example.invalid',true,'0807000000{n}',false);''')
    assert pg("select has_table_privilege('anon','customer_feedback','SELECT')")=='f'
    assert pg("select has_table_privilege('authenticated','customer_feedback','UPDATE')")=='f'
    assert pg("select has_table_privilege('service_role','customer_feedback','SELECT')")=='t'
    assert pg("select relrowsecurity from pg_class where oid='public.customer_feedback'::regclass")=='t'
    assert pg(f"insert into customer_feedback(user_id,rating,comment) values('{owner}',0,'bad')",False).returncode!=0
    assert pg(f"insert into customer_feedback(user_id,rating,comment) values('{owner}',5,'   ')",False).returncode!=0
    pg(f"insert into customer_feedback(user_id,rating,comment) values('{owner}',5,'Original review')")
    assert pg(f"select published_at is null from customer_feedback where user_id='{owner}'")=='t'
    pg(f"update customer_feedback set published_at=clock_timestamp(),reviewed_by='{actor}' where user_id='{owner}'")
    pg(f"set role service_role; update customer_feedback set comment='Edited privately' where user_id='{owner}'; reset role;")
    assert pg(f"select (published_at is null and reviewed_by is null) from customer_feedback where user_id='{owner}'")=='t'
    for trial in range(6):
        expected=pg(f"select updated_at from customer_feedback where user_id='{owner}'")
        def publish():return pg(f"update customer_feedback set published_at=clock_timestamp(),reviewed_by='{actor}' where user_id='{owner}' and updated_at='{expected}' returning id")
        def edit():return pg(f"update customer_feedback set comment='Concurrent edit {trial}' where user_id='{owner}' returning id")
        with ThreadPoolExecutor(max_workers=2) as pool:list(pool.map(lambda fn:fn(),[publish,edit]))
        assert pg(f"select published_at is null from customer_feedback where user_id='{owner}'")=='t'
    print('PASS: feedback constraints, private grants/RLS, publication reset and six real edit/publication races. Disposable database only.')
finally:
    subprocess.run(['docker','rm','-f',container],capture_output=True)
