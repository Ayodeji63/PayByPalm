-- Direct card payments. Safe to rerun after an interrupted SQL Editor attempt.
begin;
-- Ledger data is retained for historical records only.
alter table public.transactions add column if not exists payment_card_id uuid references public.linked_cards(id);
alter table public.merchants add column if not exists paystack_subaccount text check(paystack_subaccount ~ '^ACCT_[A-Za-z0-9]+$');
alter table public.transactions drop constraint if exists transactions_status_check;
alter table public.transactions add constraint transactions_status_check
 check(status in ('pending','authenticated','processing','settled','failed','cancelled'));

create table if not exists public.card_payment_attempts (
 transaction_id uuid primary key references public.transactions(id),
 user_id uuid not null references public.profiles(id),
 card_id uuid not null references public.linked_cards(id),
 reference text not null unique check(reference ~ '^pbp_pay_[a-f0-9]{32}$'),
 domain text not null check(domain in ('test','live')),
 amount_minor bigint not null check(amount_minor>0 and amount_minor<=100000000),
 currency text not null default 'NGN' check(currency='NGN'),
 signature_hash text not null,
 subaccount text,
 authorization_ciphertext text,
 status text not null default 'submitting' check(status in ('submitting','pending','success','failed','manual_review')),
 provider_transaction_id text unique,
 created_at timestamptz not null default clock_timestamp(),
 next_check_at timestamptz not null default clock_timestamp()+interval '60 seconds'
);
alter table public.card_payment_attempts enable row level security;
revoke all on public.card_payment_attempts from public,anon,authenticated;
grant all on public.card_payment_attempts to service_role;
create index if not exists card_payments_reconcile on public.card_payment_attempts(next_check_at) where status not in ('success','failed');

-- Preserve the existing invariant guard and add processing + cancellation gates.
create or replace function public.guard_payment_transition() returns trigger
language plpgsql set search_path=public as $$
begin
 if row(new.amount_minor,new.terminal_id,new.merchant_id,new.sale_id) is distinct from row(old.amount_minor,old.terminal_id,old.merchant_id,old.sale_id) then
  raise exception 'payment details are immutable' using errcode='PB002';
 end if;
 if old.status<>'pending' and row(new.matched_user_id,new.match_score,new.match_mode,new.authenticated_at,new.payment_card_id) is distinct from row(old.matched_user_id,old.match_score,old.match_mode,old.authenticated_at,old.payment_card_id) then
  raise exception 'payer authorization is immutable' using errcode='PB002';
 end if;
 if new.status<>old.status and not (
  (old.status='pending' and new.status in ('authenticated','failed','cancelled')) or
  (old.status='authenticated' and new.status in ('processing','settled','failed','cancelled')) or
  (old.status='processing' and new.status in ('settled','failed'))
 ) then raise exception 'invalid payment transition' using errcode='PB002'; end if;
 if old.status='pending' and new.status='authenticated' then
  if new.matched_user_id is null or new.match_score is null or new.match_score<0 or new.match_score>100 or new.match_mode is null then
   raise exception 'missing payer authorization' using errcode='PB005';
  end if;
  new.authenticated_at:=clock_timestamp();
 end if;
 if old.status in ('settled','failed','cancelled') and row(new.settled_at,new.failure_reason) is distinct from row(old.settled_at,old.failure_reason) then
  raise exception 'final payment outcome is immutable' using errcode='PB002';
 end if;
 return new;
end $$;

-- Only the winner receives the encrypted token. Replays never initiate HTTP.
create or replace function public.begin_card_payment(p_transaction uuid,p_terminal uuid,p_domain text,p_validity integer,p_accept_score integer)
returns setof public.card_payment_attempts language plpgsql security definer set search_path=public as $$
declare t public.transactions; c public.linked_cards; a public.card_payment_attempts; v_subaccount text;
begin
 select * into t from public.transactions where id=p_transaction and terminal_id=p_terminal for update;
 if not found then raise exception 'payment not found' using errcode='PB001'; end if;
 if exists(select 1 from public.card_payment_attempts where transaction_id=t.id) then return; end if;
 if t.status<>'authenticated' then raise exception 'payment not authenticated' using errcode='PB002'; end if;
 if p_accept_score is null or p_accept_score<70 or p_accept_score>100 or t.match_score<p_accept_score or t.match_score is null then
  raise exception 'strong palm match required' using errcode='PB005';
 end if;
 perform 1 from public.profiles where id=t.matched_user_id and palm_enrolled for share;
 if not found then raise exception 'active palm enrollment required' using errcode='PB005'; end if;
 select paystack_subaccount into v_subaccount from public.merchants where id=t.merchant_id;
 if p_domain='live' and v_subaccount is null then raise exception 'merchant settlement not configured' using errcode='PB009'; end if;
 perform pg_advisory_xact_lock(hashtextextended('cards:'||t.matched_user_id::text,0));
 select * into c from public.linked_cards where id=t.payment_card_id and user_id=t.matched_user_id and is_default and not is_paused and removed_at is null and authorization_ciphertext is not null
  and exists(select 1 from public.card_link_attempts l where l.card_id=linked_cards.id and l.status='verified' and l.domain=p_domain)
  for update;
 if not found then raise exception 'active default card required' using errcode='PB008'; end if;
 if make_date(c.exp_year::integer,c.exp_month::integer,1)+interval '1 month'<=clock_timestamp() then
  raise exception 'card expired' using errcode='PB008';
 end if;
 if p_validity is null or p_validity<1 or p_validity>60 or t.authenticated_at is null or t.authenticated_at>clock_timestamp() or t.authenticated_at<clock_timestamp()-make_interval(secs=>p_validity) then
  raise exception 'palm authorization expired' using errcode='PB006';
 end if;
 insert into public.card_payment_attempts(transaction_id,user_id,card_id,reference,domain,amount_minor,signature_hash,authorization_ciphertext,subaccount)
 values(t.id,t.matched_user_id,c.id,'pbp_pay_'||replace(gen_random_uuid()::text,'-',''),p_domain,t.amount_minor,c.signature_hash,c.authorization_ciphertext,v_subaccount) returning * into a;
 update public.transactions set status='processing' where id=t.id;
 return next a;
end $$;

-- Only provider-verified outcomes reach this function. No ledger writes.
create or replace function public.finish_card_payment(p_reference text,p_status text,p_provider_id text default null)
returns void language plpgsql security definer set search_path=public as $$
declare a public.card_payment_attempts;
begin
 select * into a from public.card_payment_attempts where reference=p_reference for update;
 if not found or a.status in ('success','failed') then return; end if;
 if p_status='success' and (p_provider_id is null or p_provider_id !~ '^[0-9]+$') then raise exception 'verified provider id required'; end if;
 if p_status not in ('pending','manual_review','success','failed') then raise exception 'invalid provider outcome'; end if;
 update public.card_payment_attempts set status=p_status,provider_transaction_id=coalesce(p_provider_id,provider_transaction_id),
  authorization_ciphertext=case when p_status in ('success','failed') then null else authorization_ciphertext end,
  next_check_at=clock_timestamp()+interval '60 seconds' where transaction_id=a.transaction_id;
 if p_status='success' then
  update public.transactions set status='settled',settled_at=clock_timestamp() where id=a.transaction_id and status='processing';
 elsif p_status='failed' then
  update public.transactions set status='failed',failure_reason='card_declined' where id=a.transaction_id and status='processing';
 end if;
end $$;
revoke execute on function public.begin_card_payment(uuid,uuid,text,integer,integer),public.finish_card_payment(text,text,text) from public,anon,authenticated;
grant execute on function public.begin_card_payment(uuid,uuid,text,integer,integer),public.finish_card_payment(text,text,text) to service_role;
-- Prevent the application role from using the retired internal funding/debit rail.
-- Older installations may have different overloads or no legacy functions.
-- Revoke every existing overload, including privileges inherited through PUBLIC.
do $$
declare v_function regprocedure;
begin
 for v_function in
  select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname in ('post_transaction','post_topup') and p.prokind='f'
 loop
  execute format('revoke execute on function %s from public,anon,authenticated,service_role',v_function);
 end loop;
end $$;
notify pgrst,'reload schema';
commit;
