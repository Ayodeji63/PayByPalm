"""Disposable PostgreSQL auth tests; never loads .env or contacts hosted services."""
from pathlib import Path
import os,subprocess,time
root=Path(__file__).resolve().parents[2]
container='pbp-auth-test-'+str(os.getpid())
def sql(text):
 r=subprocess.run(['docker','exec','-i',container,'psql','-U','postgres','-v','ON_ERROR_STOP=1','-q'],input=text,text=True,capture_output=True)
 if r.returncode:raise AssertionError(r.stderr)
 return r.stdout
try:
 subprocess.run(['docker','run','-d','--name',container,'-p','127.0.0.1::5432','-e','POSTGRES_PASSWORD=auth-test-only','postgres:17-alpine'],check=True,capture_output=True)
 for _ in range(60):
  if subprocess.run(['docker','exec',container,'pg_isready','-U','postgres'],capture_output=True).returncode==0:break
  time.sleep(.5)
 sql((root/'supabase/tests/local_supabase_stub.sql').read_text())
 for path in sorted((root/'supabase/migrations').glob('*.sql')):
  if path.name.startswith('0025'):continue
  sql(path.read_text())
 sql((root/'supabase/seed.sql').read_text())
 port=subprocess.check_output(['docker','port',container,'5432/tcp'],text=True).strip().rsplit(':',1)[1]
 env={**os.environ,'AUTH_TEST_DATABASE_URL':f'postgres://postgres:auth-test-only@127.0.0.1:{port}/postgres'}
 subprocess.run(['corepack','pnpm','exec','tsx','scripts/test-auth-migration.ts'],cwd=root/'backend',env=env,check=True)
finally:
 subprocess.run(['docker','rm','-f',container],capture_output=True)
