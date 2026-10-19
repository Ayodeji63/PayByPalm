-- Separate card credentials, defaults and unfinished checkouts by payment mode.
-- Existing financial history is retained. An ambiguous/unverified legacy card
-- stays unclassified and cannot be offered as a test or live credential.
begin;
alter table public.linked_cards add column if not exists domain text
  check (domain in ('test','live'));
update public.linked_cards c set domain=proof.domain
 from (select card_id,min(domain) as domain from public.card_link_attempts
        where status='verified' and card_id is not null group by card_id
        having count(distinct domain)=1) proof
 where c.id=proof.card_id and c.domain is null;

-- Legacy trusted writers default to test; live verification always sets domain explicitly.
alter table public.linked_cards alter column domain set default 'test';

alter table public.linked_cards drop constraint if exists linked_cards_signature_hash_key;
create unique index if not exists linked_cards_signature_by_mode
 on public.linked_cards(domain,signature_hash) nulls not distinct;
drop index if exists public.linked_cards_one_default;
create unique index linked_cards_one_default on public.linked_cards(user_id,domain)
 where is_default and removed_at is null;
drop index if exists public.card_link_one_open;
create unique index card_link_one_open on public.card_link_attempts(user_id,domain)
 where status in ('initializing','pending');

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
  -- Global signature lock prevents two owners racing to claim the same card.
  perform pg_advisory_xact_lock(hashtextextended('card-signature:'||a.domain||':'||(p_card->>'signature_hash'),0));
  select * into c from public.linked_cards where domain=a.domain and signature_hash=p_card->>'signature_hash' for update;
  if found and c.user_id<>a.user_id then
   p_card:=null;
  else
   insert into public.linked_cards(user_id,domain,signature_hash,authorization_ciphertext,bank,brand,last4,exp_month,exp_year,is_default)
   values(a.user_id,a.domain,p_card->>'signature_hash',p_card->>'authorization_ciphertext',p_card->>'bank',p_card->>'brand',p_card->>'last4',p_card->>'exp_month',p_card->>'exp_year',
     not exists(select 1 from public.linked_cards where user_id=a.user_id and domain=a.domain and removed_at is null and is_default))
   on conflict(domain,signature_hash) do update set authorization_ciphertext=excluded.authorization_ciphertext,
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
declare v_domain text;
begin
 perform pg_advisory_xact_lock(hashtextextended('cards:'||p_user::text,0));
 select domain into v_domain from public.linked_cards where id=p_id and user_id=p_user and removed_at is null for update;
 if not found then return false; end if;
 if p_action='default' then
  update public.linked_cards set is_default=false where user_id=p_user and domain is not distinct from v_domain and is_default;
  update public.linked_cards set is_default=true where id=p_id;
 elsif p_action='pause' then update public.linked_cards set is_paused=true where id=p_id;
 elsif p_action='resume' then update public.linked_cards set is_paused=false where id=p_id;
 elsif p_action='remove' then
  update public.linked_cards set removed_at=clock_timestamp(),authorization_ciphertext=null,is_default=false where id=p_id;
 else raise exception 'invalid card action'; end if;
 return true;
end $$;
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
 -- Merchant bank settlement is live-only. Sandbox stays in the test business
 -- so a retained live ACCT code cannot break a switch back to test.
 select case when p_domain='live' then paystack_subaccount else null end into v_subaccount from public.merchants where id=t.merchant_id;
 if p_domain='live' and v_subaccount is null then raise exception 'merchant settlement not configured' using errcode='PB009'; end if;
 perform pg_advisory_xact_lock(hashtextextended('cards:'||t.matched_user_id::text,0));
 select * into c from public.linked_cards where id=t.payment_card_id and user_id=t.matched_user_id and domain=p_domain and is_default and not is_paused and removed_at is null and authorization_ciphertext is not null
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


revoke execute on function public.complete_card_link(text,uuid,jsonb,text),public.edit_linked_card(uuid,uuid,text),public.begin_card_payment(uuid,uuid,text,integer,integer) from public,anon,authenticated;
grant execute on function public.complete_card_link(text,uuid,jsonb,text),public.edit_linked_card(uuid,uuid,text),public.begin_card_payment(uuid,uuid,text,integer,integer) to service_role;
notify pgrst,'reload schema';
commit;
