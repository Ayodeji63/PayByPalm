-- Apply after 0020_admin_onboarding.sql. Retains existing merchants and live codes.
begin;
alter table public.merchants add column if not exists paystack_test_subaccount text
 check(paystack_test_subaccount ~ '^ACCT_[A-Za-z0-9]+$');
create table if not exists public.merchant_payout_setups(
 merchant_id uuid not null references public.merchants(id), domain text not null check(domain in ('test','live')),
 request_id uuid not null unique, actor_id uuid not null,
 fingerprint text not null check(fingerprint ~ '^[a-f0-9]{64}$'),
 bank_code text not null check(bank_code ~ '^[0-9]{2,12}$'),bank_name text not null,
 account_last4 text not null check(account_last4 ~ '^[0-9]{4}$'),account_name text not null,
 percentage_charge numeric not null check(percentage_charge between 0 and 100),
 status text not null check(status in ('submitting','needs_review','rejected','created')),
 subaccount_code text, provider_verified boolean, provider_active boolean,
 created_at timestamptz not null default clock_timestamp(),updated_at timestamptz not null default clock_timestamp(),
 primary key(merchant_id,domain)
);
create unique index if not exists merchant_payout_code_mode on public.merchant_payout_setups(domain,subaccount_code) where subaccount_code is not null;
alter table public.merchant_payout_setups enable row level security;
revoke all on public.merchant_payout_setups from public,anon,authenticated;
grant select,insert,update on public.merchant_payout_setups to service_role;
create or replace function public.admin_begin_payout(
 p_actor uuid,p_merchant uuid,p_domain text,p_request uuid,p_fingerprint text,
 p_bank_code text,p_bank_name text,p_last4 text,p_account_name text,p_fee numeric,p_expected timestamptz
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare m public.merchants; s public.merchant_payout_setups; code text;
begin
 if p_actor is null or p_request is null or p_domain not in ('test','live') or p_domain is null or p_fee is null or p_fee not between 0 and 100
 or p_fingerprint is null or p_fingerprint !~ '^[a-f0-9]{64}$' or p_bank_code is null or p_bank_code !~ '^[0-9]{2,12}$'
 or p_last4 is null or p_last4 !~ '^[0-9]{4}$' or p_account_name is null or length(p_account_name) not between 1 and 200
 or p_bank_name is null or length(p_bank_name) not between 1 and 160 then
  raise exception 'invalid payout setup' using errcode='PA400'; end if;
 perform pg_advisory_xact_lock(hashtextextended('admin-merchant:'||p_merchant::text,0));
 select * into m from public.merchants where id=p_merchant for update;
 if not found then raise exception 'merchant missing' using errcode='PA404'; end if;
 select * into s from public.merchant_payout_setups where merchant_id=p_merchant and domain=p_domain for update;
 if found and s.status<>'rejected' then
  if s.fingerprint<>p_fingerprint then raise exception 'another bank setup is already in progress' using errcode='PA409'; end if;
  return jsonb_build_object('claimed',false,'setup',to_jsonb(s));
 end if;
 code:=case when p_domain='live' then m.paystack_subaccount else m.paystack_test_subaccount end;
 if code is not null then raise exception 'merchant already configured' using errcode='PA409'; end if;
 if p_expected is null or m.updated_at<>p_expected then raise exception 'merchant changed' using errcode='PA409'; end if;
 insert into public.merchant_payout_setups(merchant_id,domain,request_id,actor_id,fingerprint,bank_code,bank_name,account_last4,account_name,percentage_charge,status)
 values(p_merchant,p_domain,p_request,p_actor,p_fingerprint,p_bank_code,p_bank_name,p_last4,p_account_name,p_fee,'submitting')
 on conflict(merchant_id,domain) do update set request_id=excluded.request_id,actor_id=excluded.actor_id,fingerprint=excluded.fingerprint,
 bank_code=excluded.bank_code,bank_name=excluded.bank_name,account_last4=excluded.account_last4,account_name=excluded.account_name,
 percentage_charge=excluded.percentage_charge,status='submitting',updated_at=clock_timestamp() returning * into s;
 insert into public.admin_audit(actor_id,action,entity_id,merchant_id,label)values(p_actor,'merchant.payout_started',p_merchant,p_merchant,m.name);
 return jsonb_build_object('claimed',true,'setup',to_jsonb(s));
end $$;
create or replace function public.admin_complete_payout(
 p_actor uuid,p_merchant uuid,p_domain text,p_request uuid,p_code text,p_verified boolean,p_active boolean
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare m public.merchants; s public.merchant_payout_setups; current_code text;
begin
 if p_actor is null or p_code is null or p_code !~ '^ACCT_[A-Za-z0-9]{1,80}$' or p_verified is null or p_active is null then
  raise exception 'invalid payout result' using errcode='PA400'; end if;
 perform pg_advisory_xact_lock(hashtextextended('admin-merchant:'||p_merchant::text,0));
 select * into m from public.merchants where id=p_merchant for update;
 if not found then raise exception 'merchant missing' using errcode='PA404'; end if;
 select * into s from public.merchant_payout_setups where merchant_id=p_merchant and domain=p_domain and request_id=p_request for update;
 if not found or s.status='rejected' then raise exception 'setup missing or rejected' using errcode='PA409'; end if;
 current_code:=case when p_domain='live' then m.paystack_subaccount else m.paystack_test_subaccount end;
 if current_code is not null and current_code<>p_code then raise exception 'settlement changed' using errcode='PA409'; end if;
 if s.subaccount_code is not null and s.subaccount_code<>p_code then raise exception 'different provider result' using errcode='PA409'; end if;
 if exists(select 1 from public.merchant_payout_setups where domain=p_domain and subaccount_code=p_code and merchant_id<>p_merchant) then
  raise exception 'subaccount used elsewhere' using errcode='PA409'; end if;
 update public.merchant_payout_setups set status='created',subaccount_code=p_code,provider_verified=p_verified,provider_active=p_active,updated_at=clock_timestamp()
  where merchant_id=p_merchant and domain=p_domain returning * into s;
 if current_code is null then
  update public.merchants set paystack_subaccount=case when p_domain='live' then p_code else paystack_subaccount end,
   paystack_test_subaccount=case when p_domain='test' then p_code else paystack_test_subaccount end,updated_at=clock_timestamp() where id=p_merchant returning * into m;
  insert into public.admin_audit(actor_id,action,entity_id,merchant_id,label)values(p_actor,'merchant.payout_created',p_merchant,p_merchant,m.name);
 end if;
 return jsonb_build_object('merchant',to_jsonb(m),'setup',to_jsonb(s));
end $$;
revoke execute on function public.admin_begin_payout(uuid,uuid,text,uuid,text,text,text,text,text,numeric,timestamptz),public.admin_complete_payout(uuid,uuid,text,uuid,text,boolean,boolean) from public,anon,authenticated;
grant execute on function public.admin_begin_payout(uuid,uuid,text,uuid,text,text,text,text,text,numeric,timestamptz),public.admin_complete_payout(uuid,uuid,text,uuid,text,boolean,boolean) to service_role;
notify pgrst,'reload schema';
commit;
