-- Additive provider isolation. Existing records remain Paystack; no money is moved.
begin;
set local lock_timeout='10s';
set local statement_timeout='60s';
alter table public.linked_cards add column provider text not null default 'paystack' check(provider in ('paystack','flutterwave'));
alter table public.card_link_attempts add column provider text not null default 'paystack' check(provider in ('paystack','flutterwave'));
alter table public.card_payment_attempts add column provider text not null default 'paystack' check(provider in ('paystack','flutterwave'));
alter table public.linked_cards add column credential_expires_at timestamptz;
alter table public.transactions add column payment_provider text check(payment_provider in ('paystack','flutterwave'));
alter table public.transactions add column payment_domain text check(payment_domain in ('test','live'));
update public.transactions t set payment_provider='paystack',payment_domain=c.domain from public.linked_cards c where t.payment_card_id=c.id;
alter table public.merchants add column flutterwave_subaccount text check(flutterwave_subaccount ~ '^RS_[A-Za-z0-9]{1,100}$');
alter table public.merchants add column flutterwave_test_subaccount text check(flutterwave_test_subaccount ~ '^RS_[A-Za-z0-9]{1,100}$');
alter table public.card_link_attempts drop constraint card_link_attempts_amount_minor_check;
alter table public.card_link_attempts add constraint card_link_amount_by_provider check((provider='paystack' and amount_minor=5000) or (provider='flutterwave' and amount_minor=10000));
alter table public.card_link_attempts drop constraint card_link_attempts_user_id_request_id_key;
create unique index card_link_request_by_provider on public.card_link_attempts(user_id,provider,domain,request_id);
drop index public.linked_cards_signature_by_mode;
create unique index linked_cards_signature_by_mode on public.linked_cards(provider,domain,signature_hash) nulls not distinct;
drop index public.linked_cards_one_default;
create unique index linked_cards_one_default on public.linked_cards(user_id,provider,domain) where is_default and removed_at is null;
drop index public.card_link_one_open;
create unique index card_link_one_open on public.card_link_attempts(user_id,provider,domain) where status in ('initializing','pending');
alter table public.card_payment_attempts drop constraint card_payment_attempts_provider_transaction_id_key;
create unique index card_payment_id_by_provider on public.card_payment_attempts(provider,domain,provider_transaction_id);

-- Preserve old clients while sealing the provider/mode selected at authentication.
create function public.guard_payment_provider() returns trigger language plpgsql set search_path='' as $$
declare c public.linked_cards;
begin
 if old.status<>'pending' and row(new.payment_provider,new.payment_domain) is distinct from row(old.payment_provider,old.payment_domain) then raise exception 'payment provider is immutable' using errcode='PB002'; end if;
 if old.status='pending' and new.status='authenticated' then
  select * into c from public.linked_cards where id=new.payment_card_id and user_id=new.matched_user_id for share;
  if not found then raise exception 'saved card required' using errcode='PB008'; end if;
  new.payment_provider:=coalesce(new.payment_provider,'paystack');
  new.payment_domain:=coalesce(new.payment_domain,c.domain);
  if c.provider<>new.payment_provider or c.domain is distinct from new.payment_domain then raise exception 'card provider or mode mismatch' using errcode='PB008'; end if;
 end if;
 return new;
end $$;
create trigger guard_payment_provider before update on public.transactions for each row execute function public.guard_payment_provider();

create function public.guard_saved_provider() returns trigger language plpgsql set search_path='' as $$
begin
 if row(new.provider,new.domain) is distinct from row(old.provider,old.domain) then raise exception 'saved provider context is immutable'; end if;
 return new;
end $$;
create trigger guard_saved_provider before update on public.linked_cards for each row execute function public.guard_saved_provider();
create trigger guard_saved_provider before update on public.card_link_attempts for each row execute function public.guard_saved_provider();
create trigger guard_saved_provider before update on public.card_payment_attempts for each row execute function public.guard_saved_provider();

create or replace function public.complete_card_link(p_reference text,p_owner uuid,p_card jsonb,p_transaction_id text)
returns void language plpgsql security definer set search_path=public as $$
declare a public.card_link_attempts; c public.linked_cards; v_id uuid;
begin
 select * into a from public.card_link_attempts where reference=p_reference for update;
 if not found or a.lease_owner is distinct from p_owner or a.lease_until<clock_timestamp() then
  raise exception 'card verification lease lost';
 end if;
 if a.status not in ('initializing','pending','init_failed','failed') then return; end if;
 -- Shared by card edits and verification so defaults and removals serialize.
 perform pg_advisory_xact_lock(hashtextextended('cards:'||a.user_id::text,0));
 if p_card is not null then
  if a.provider='flutterwave' and ((p_card->>'credential_expires_at')::timestamptz is null or (p_card->>'credential_expires_at')::timestamptz<=clock_timestamp() or (p_card->>'credential_expires_at')::timestamptz>clock_timestamp()+interval '366 days') then raise exception 'invalid token expiry'; end if;
  -- Global signature lock prevents two owners racing to claim the same card.
  perform pg_advisory_xact_lock(hashtextextended('card-signature:'||a.provider||':'||a.domain||':'||(p_card->>'signature_hash'),0));
  select * into c from public.linked_cards where provider=a.provider and domain=a.domain and signature_hash=p_card->>'signature_hash' for update;
  if found and c.user_id<>a.user_id then
   p_card:=null;
  else
   insert into public.linked_cards(user_id,domain,provider,credential_expires_at,signature_hash,authorization_ciphertext,bank,brand,last4,exp_month,exp_year,is_default)
   values(a.user_id,a.domain,a.provider,(p_card->>'credential_expires_at')::timestamptz,p_card->>'signature_hash',p_card->>'authorization_ciphertext',p_card->>'bank',p_card->>'brand',p_card->>'last4',p_card->>'exp_month',p_card->>'exp_year',
     not exists(select 1 from public.linked_cards where user_id=a.user_id and domain=a.domain and provider=a.provider and removed_at is null and is_default))
   on conflict(provider,domain,signature_hash) do update set authorization_ciphertext=excluded.authorization_ciphertext,credential_expires_at=excluded.credential_expires_at,
     bank=excluded.bank,brand=excluded.brand,last4=excluded.last4,exp_month=excluded.exp_month,exp_year=excluded.exp_year,
     removed_at=null,is_paused=false,is_default=linked_cards.is_default or excluded.is_default
   returning id into v_id;
  end if;
 end if;
 update public.card_link_attempts set status=case when p_card is null then 'unsupported' else 'verified' end,
   provider_transaction_id=p_transaction_id,card_id=v_id where id=a.id;
end $$;

create or replace function public.edit_linked_card(p_user uuid,p_id uuid,p_action text)
returns boolean language plpgsql security definer set search_path=public as $$
declare v_domain text; v_provider text;
begin
 perform pg_advisory_xact_lock(hashtextextended('cards:'||p_user::text,0));
 select domain,provider into v_domain,v_provider from public.linked_cards where id=p_id and user_id=p_user and removed_at is null for update;
 if not found then return false; end if;
 if p_action='default' then
  update public.linked_cards set is_default=false where user_id=p_user and domain is not distinct from v_domain and provider=v_provider and is_default;
  update public.linked_cards set is_default=true where id=p_id;
 elsif p_action='pause' then update public.linked_cards set is_paused=true where id=p_id;
 elsif p_action='resume' then update public.linked_cards set is_paused=false where id=p_id;
 elsif p_action='remove' then
  update public.linked_cards set removed_at=clock_timestamp(),authorization_ciphertext=null,is_default=false where id=p_id;
 else raise exception 'invalid card action'; end if;
 return true;
end $$;

create or replace function public.begin_provider_card_payment(p_transaction uuid,p_terminal uuid,p_domain text,p_validity integer,p_accept_score integer,p_provider text)
returns setof public.card_payment_attempts language plpgsql security definer set search_path=public as $$
declare t public.transactions; c public.linked_cards; a public.card_payment_attempts; v_subaccount text;
begin
 select * into t from public.transactions where id=p_transaction and terminal_id=p_terminal for update;
 if not found then raise exception 'payment not found' using errcode='PB001'; end if;
 if exists(select 1 from public.card_payment_attempts where transaction_id=t.id) then return; end if;
 if p_provider not in ('paystack','flutterwave') or p_provider is null or t.payment_provider is distinct from p_provider or t.payment_domain is distinct from p_domain then raise exception 'payment provider or mode changed' using errcode='PB008'; end if;
 if t.palm_provider is distinct from 'ccnet' or t.match_score is null or t.match_score<50 then raise exception 'fresh CCNet authentication required' using errcode='PB005'; end if;
 perform 1 from public.profiles where id=t.matched_user_id for share;
 perform 1 from public.palm_bindings where id=t.palm_binding_id and user_id=t.matched_user_id and provider='ccnet' and revoked_at is null for share;
 if not found then raise exception 'palm binding revoked or replaced' using errcode='PB005'; end if;
 if t.status<>'authenticated' then raise exception 'payment not authenticated' using errcode='PB002'; end if;
 if p_accept_score is null or p_accept_score<50 or p_accept_score>100 or t.match_score<p_accept_score or t.match_score is null then
  raise exception 'strong palm match required' using errcode='PB005';
 end if;
 perform 1 from public.profiles where id=t.matched_user_id and palm_enrolled for share;
 if not found then raise exception 'active palm enrollment required' using errcode='PB005'; end if;
 -- Merchant bank settlement is live-only. Sandbox stays in the test business
 -- so a retained live ACCT code cannot break a switch back to test.
 select case when p_domain='live' and p_provider='paystack' then paystack_subaccount when p_domain='live' and p_provider='flutterwave' then flutterwave_subaccount when p_domain='test' and p_provider='flutterwave' then flutterwave_test_subaccount else null end into v_subaccount from public.merchants where id=t.merchant_id;
 if p_domain='live' and v_subaccount is null then raise exception 'merchant settlement not configured' using errcode='PB009'; end if;
 perform pg_advisory_xact_lock(hashtextextended('cards:'||t.matched_user_id::text,0));
 select * into c from public.linked_cards where id=t.payment_card_id and user_id=t.matched_user_id and domain=p_domain and provider=p_provider and is_default and not is_paused and removed_at is null and authorization_ciphertext is not null
  and exists(select 1 from public.card_link_attempts l where l.card_id=linked_cards.id and l.status='verified' and l.domain=p_domain and l.provider=p_provider)
  for update;
 if not found then raise exception 'active default card required' using errcode='PB008'; end if;
 if p_provider='flutterwave' and (c.credential_expires_at is null or c.credential_expires_at<=clock_timestamp()) then raise exception 'saved card token expired; relink card' using errcode='PB008'; end if;
 if make_date(c.exp_year::integer,c.exp_month::integer,1)+interval '1 month'<=clock_timestamp() then
  raise exception 'card expired' using errcode='PB008';
 end if;
 if p_validity is null or p_validity<1 or p_validity>60 or t.authenticated_at is null or t.authenticated_at>clock_timestamp() or t.authenticated_at<clock_timestamp()-make_interval(secs=>p_validity) then
  raise exception 'palm authorization expired' using errcode='PB006';
 end if;
 insert into public.card_payment_attempts(transaction_id,user_id,card_id,reference,domain,provider,amount_minor,signature_hash,authorization_ciphertext,subaccount)
 values(t.id,t.matched_user_id,c.id,'pbp_pay_'||replace(gen_random_uuid()::text,'-',''),p_domain,p_provider,t.amount_minor,c.signature_hash,c.authorization_ciphertext,v_subaccount) returning * into a;
 update public.transactions set status='processing' where id=t.id;
 return next a;
end $$;

-- Legacy charge entry point can only claim a Paystack card.
create or replace function public.begin_card_payment(p_transaction uuid,p_terminal uuid,p_domain text,p_validity integer,p_accept_score integer)
returns setof public.card_payment_attempts language sql security definer set search_path='' as $$
 select * from public.begin_provider_card_payment(p_transaction,p_terminal,p_domain,p_validity,p_accept_score,'paystack');
$$;
revoke all on function public.guard_payment_provider(),public.guard_saved_provider(),public.begin_provider_card_payment(uuid,uuid,text,integer,integer,text),public.begin_card_payment(uuid,uuid,text,integer,integer),public.complete_card_link(text,uuid,jsonb,text),public.edit_linked_card(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.begin_provider_card_payment(uuid,uuid,text,integer,integer,text),public.begin_card_payment(uuid,uuid,text,integer,integer),public.complete_card_link(text,uuid,jsonb,text),public.edit_linked_card(uuid,uuid,text) to service_role;
-- Admin-selected recipient, with optimistic concurrency and an immutable audit entry.
create function public.admin_set_flutterwave_subaccount(p_actor uuid,p_merchant uuid,p_domain text,p_code text,p_expected timestamptz)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare m public.merchants;
begin
 if p_actor is null or p_domain is null or p_domain not in ('test','live') or p_code is null or p_code !~ '^RS_[A-Za-z0-9]{1,100}$' then raise exception 'invalid subaccount' using errcode='PA400'; end if;
 select * into m from public.merchants where id=p_merchant for update;
 if not found then raise exception 'merchant missing' using errcode='PA404'; end if;
 if p_expected is null or m.updated_at<>p_expected then raise exception 'merchant changed' using errcode='PA409'; end if;
 update public.merchants set flutterwave_subaccount=case when p_domain='live' then p_code else flutterwave_subaccount end,
 flutterwave_test_subaccount=case when p_domain='test' then p_code else flutterwave_test_subaccount end,updated_at=clock_timestamp() where id=p_merchant returning * into m;
 insert into public.admin_audit(actor_id,action,entity_id,merchant_id,label) values(p_actor,'merchant.flutterwave_subaccount.'||p_domain,p_merchant,p_merchant,m.name);
 return to_jsonb(m);
end $$;
revoke all on function public.admin_set_flutterwave_subaccount(uuid,uuid,text,text,timestamptz) from public,anon,authenticated;
grant execute on function public.admin_set_flutterwave_subaccount(uuid,uuid,text,text,timestamptz) to service_role;
notify pgrst,'reload schema';
commit;
