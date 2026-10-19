"""H5 migration, permissions and real concurrent replay checks in disposable Postgres."""
import concurrent.futures
import os
from pathlib import Path
import subprocess
import time

root = Path(__file__).resolve().parents[1]
container = f'pbp-h5-test-{os.getpid()}'

def pg(sql):
    result = subprocess.run(['docker', 'exec', '-i', container, 'psql', '-U', 'postgres', '-d', 'pbp', '-v', 'ON_ERROR_STOP=1', '-q', '-t', '-A'], input=sql, text=True, capture_output=True)
    if result.returncode:
        raise AssertionError(result.stderr)
    return result.stdout.strip()

try:
    subprocess.run(['docker', 'run', '-d', '--name', container, '-e', 'POSTGRES_PASSWORD=disposable-test-only', '-e', 'POSTGRES_DB=pbp', 'postgres:17-alpine'], check=True, capture_output=True)
    for _ in range(60):
        if subprocess.run(['docker', 'exec', container, 'pg_isready', '-U', 'postgres'], capture_output=True).returncode == 0:
            break
        time.sleep(0.5)
    pg((root / 'tests/local_supabase_stub.sql').read_text())
    for path in sorted((root / 'migrations').glob('*.sql')):
        pg(path.read_text())
    pg((root / 'migrations/0021_palm_h5_captures.sql').read_text())
    pg((root / 'seed.sql').read_text())
    pg((root / 'tests/palm_h5_test.sql').read_text())
    print('PASS: migration, rerun, permissions, scope, expiry, replay and atomic enrolment', flush=True)
    capture_id = pg("""insert into public.palm_capture_sessions(terminal_id,user_id,purpose,scope_id,token_hash,expires_at)
 values('22222222-2222-4222-8222-222222222222','11111111-1111-4111-8111-111111111111','payment','33333333-3333-4333-8333-333333333333',repeat('a',64),clock_timestamp()+interval '60 seconds') returning id;""")
    def consume(_):
        try:
            pg(f"select public.consume_palm_capture('{capture_id}','22222222-2222-4222-8222-222222222222','33333333-3333-4333-8333-333333333333','payment',repeat('a',64),repeat('f',64));")
            return True
        except AssertionError as error:
            assert 'Palm capture expired, used or belongs' in str(error)
            return False
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
        assert sorted(pool.map(consume, range(2))) == [False, True], 'both concurrent requests consumed the grant'
    print('PASS: concurrent duplicate capture has exactly one winner', flush=True)
finally:
    subprocess.run(['docker', 'rm', '-f', container], capture_output=True)
