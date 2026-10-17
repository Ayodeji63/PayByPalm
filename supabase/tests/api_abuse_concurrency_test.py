"""Shared limiter/stream-cap races against an isolated test container."""
import concurrent.futures
import hashlib
import subprocess
import sys
import uuid

container = sys.argv[1]
if not container.startswith('pbp-'):
    raise SystemExit('Use an isolated pbp-* test container.')

def pg(sql):
    result = subprocess.run(['docker', 'exec', '-i', container, 'psql', '-U', 'postgres', '-d', 'pbp', '-At', '-v', 'ON_ERROR_STOP=1'],
                            input=sql, text=True, capture_output=True)
    if result.returncode:
        raise AssertionError(result.stderr)
    return result.stdout.strip()

key = hashlib.sha256(str(uuid.uuid4()).encode()).hexdigest()
with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
    results = list(pool.map(lambda _: pg(f"select public.consume_api_budget('{key}',5,60);"), range(20)))
assert results.count('0') == 5, f'Shared request budget exceeded: {results}'
print('Concurrent shared request budget: passed')
terminal = pg('select id from public.terminals limit 1;')
with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
    results = list(pool.map(lambda _: pg(f"select public.acquire_api_stream('{terminal}','{uuid.uuid4()}');"), range(10)))
leases = [value for value in results if value]
assert len(leases) == 2, f'Shared stream cap exceeded: {results}'
for lease in leases:
    pg(f"select public.release_api_stream('{lease}');")
print('Concurrent shared stream leases: passed')
