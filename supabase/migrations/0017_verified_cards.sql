-- Card metadata may be returned by the API; authorization credentials never are.
create table public.linked_cards (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references public.profiles(id) on delete cascade,
 signature_hash text not null unique check(length(signature_hash)=64),
 authorization_ciphertext text,
 bank text not null, brand text not null,
 last4 text not null check(last4 ~ '^[0-9]{4}$'),
 exp_month text not null check(exp_month ~ '^(0[1-9]|1[0-2])$'),
 exp_year text not null check(exp_year ~ '^[0-9]{4}$'),
 is_default boolean not null default false,
 is_paused boolean not null default false,
 removed_at timestamptz,
 created_at timestamptz not null default now()
);
create unique index linked_cards_one_default on public.linked_cards(user_id) where is_default and removed_at is null;
create table public.card_link_attempts (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references public.profiles(id) on delete cascade,
 request_id uuid not null,
 reference text not null unique,
 email text not null,
 domain text not null check(domain in ('test','live')),
 amount_minor integer not null default 5000 check(amount_minor=5000),
 currency text not null default 'NGN' check(currency='NGN'),
 status text not null default 'initializing' check(status in ('initializing','pending','verified','unsupported','invalid','init_failed','failed')),
 checkout_url text,
 init_started_at timestamptz,
 provider_transaction_id text,
 card_id uuid references public.linked_cards(id),
 refund_status text not null default 'not_requested' check(refund_status in ('not_requested','submitting','pending','processed','failed','manual_review')),
 refund_id text,
 lease_owner uuid,
 lease_until timestamptz,
 next_check_at timestamptz not null default now(),
 created_at timestamptz not null default now(),
 unique(user_id,request_id)
);
create unique index card_link_one_open on public.card_link_attempts(user_id) where status in ('initializing','pending');
create index card_link_reconcile_due on public.card_link_attempts(next_check_at);
alter table public.linked_cards enable row level security;
alter table public.card_link_attempts enable row level security;
revoke all on public.linked_cards,public.card_link_attempts from public,anon,authenticated;
grant select,insert,update,delete on public.linked_cards,public.card_link_attempts to service_role;

create function public.claim_card_link(p_reference text,p_owner uuid)
returns setof public.card_link_attempts language sql security definer set search_path=public as $$
 update public.card_link_attempts set lease_owner=p_owner,lease_until=clock_timestamp()+interval '2 minutes'
 where reference=p_reference and (lease_until is null or lease_until<clock_timestamp()) returning *;
$$;

-- Complete verification once. Concurrent callbacks/webhooks cannot relink a
-- removed card or attach the same authorization to a different account.
create function public.complete_card_link(p_reference text,p_owner uuid,p_card jsonb,p_transaction_id text)
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
  perform pg_advisory_xact_lock(hashtextextended('card-signature:'||(p_card->>'signature_hash'),0));
  select * into c from public.linked_cards where signature_hash=p_card->>'signature_hash' for update;
  if found and c.user_id<>a.user_id then
   p_card:=null;
  else
   insert into public.linked_cards(user_id,signature_hash,authorization_ciphertext,bank,brand,last4,exp_month,exp_year,is_default)
   values(a.user_id,p_card->>'signature_hash',p_card->>'authorization_ciphertext',p_card->>'bank',p_card->>'brand',p_card->>'last4',p_card->>'exp_month',p_card->>'exp_year',
     not exists(select 1 from public.linked_cards where user_id=a.user_id and removed_at is null and is_default))
   on conflict(signature_hash) do update set authorization_ciphertext=excluded.authorization_ciphertext,
     bank=excluded.bank,brand=excluded.brand,last4=excluded.last4,exp_month=excluded.exp_month,exp_year=excluded.exp_year,
     removed_at=null,is_paused=false,is_default=linked_cards.is_default or excluded.is_default
   returning id into v_id;
  end if;
 end if;
 update public.card_link_attempts set status=case when p_card is null then 'unsupported' else 'verified' end,
   provider_transaction_id=p_transaction_id,card_id=v_id where id=a.id;
end $$;

create function public.edit_linked_card(p_user uuid,p_id uuid,p_action text)
returns boolean language plpgsql security definer set search_path=public as $$
begin
 perform pg_advisory_xact_lock(hashtextextended('cards:'||p_user::text,0));
 perform 1 from public.linked_cards where id=p_id and user_id=p_user and removed_at is null for update;
 if not found then return false; end if;
 if p_action='default' then
  update public.linked_cards set is_default=false where user_id=p_user and is_default;
  update public.linked_cards set is_default=true where id=p_id;
 elsif p_action='pause' then update public.linked_cards set is_paused=true where id=p_id;
 elsif p_action='resume' then update public.linked_cards set is_paused=false where id=p_id;
 elsif p_action='remove' then
  update public.linked_cards set removed_at=clock_timestamp(),authorization_ciphertext=null,is_default=false where id=p_id;
 else raise exception 'invalid card action'; end if;
 return true;
end $$;
revoke execute on function public.claim_card_link(text,uuid),public.complete_card_link(text,uuid,jsonb,text),public.edit_linked_card(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.claim_card_link(text,uuid),public.complete_card_link(text,uuid,jsonb,text),public.edit_linked_card(uuid,uuid,text) to service_role;
notify pgrst,'reload schema';
