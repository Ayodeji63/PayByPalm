"""Exercise merchant grants/reporting on disposable PostgreSQL, never Supabase."""
import os,subprocess,time
from pathlib import Path
root=Path(__file__).resolve().parents[2]
container='pbp-merchant-test-'+str(os.getpid())
def sql(text):
 r=subprocess.run(['docker','exec','-i',container,'psql','-U','postgres','-v','ON_ERROR_STOP=1','-q'],input=text,text=True,capture_output=True)
 if r.returncode:raise AssertionError(r.stderr)
 return r.stdout
try:
 subprocess.run(['docker','run','-d','--name',container,'-e','POSTGRES_PASSWORD=local-test-only','postgres:17-alpine'],check=True,capture_output=True)
 for _ in range(60):
  if subprocess.run(['docker','exec',container,'pg_isready','-U','postgres'],capture_output=True).returncode==0:break
  time.sleep(.5)
 sql('create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key,email text unique,email_confirmed_at timestamptz);create table public.profiles(id uuid primary key references auth.users(id));')
 sql((root/'admin/tests/core_schema.sql').read_text())
 sql('alter table public.merchants add column paystack_subaccount text;')
 sql((root/'admin/db/0020_admin_onboarding.sql').read_text())
 sql((root/'admin/db/0023_merchant_payouts.sql').read_text())
 ledger=(root/'supabase/migrations/0005_ledger.sql').read_text()
 sql(ledger[ledger.index('create table public.transactions'):ledger.index('comment on column')])
 sql("alter table public.transactions drop constraint transactions_status_check;alter table public.transactions add constraint transactions_status_check check(status in ('pending','authenticated','processing','settled','failed','cancelled'));create table public.linked_cards(id uuid primary key);")
 payment=(root/'supabase/migrations/0018_card_payments.sql').read_text()
 sql(payment[payment.index('create table if not exists public.card_payment_attempts'):payment.index('alter table public.card_payment_attempts')])
 sql('grant select on public.transactions,public.terminals,public.card_payment_attempts to service_role;')
 migration=(root/'supabase/migrations/0024_merchant_portal.sql').read_text();sql(migration);sql(migration)
 sql((root/'merchant/tests/portal.sql').read_text())
 print('PASS: additive/rerunnable migration, explicit verified-account grants, revocation, tenant/mode isolation, Lagos dates, full-history totals, safe report columns and service-only tables/functions.')
finally:
 subprocess.run(['docker','rm','-f',container],capture_output=True)
