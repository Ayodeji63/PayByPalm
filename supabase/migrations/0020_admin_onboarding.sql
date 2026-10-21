-- Apply once to the existing PayByPalm Supabase database. Additive and rerunnable.
begin;
alter table public.merchants add column if not exists contact_email text;
alter table public.merchants add column if not exists contact_phone text;
alter table public.merchants add column if not exists address text;
alter table public.merchants add column if not exists updated_at timestamptz not null default now();
alter table public.terminals add column if not exists disabled_at timestamptz;
alter table public.terminals add column if not exists updated_at timestamptz not null default now();

create table if not exists public.admin_audit (
 id uuid primary key default gen_random_uuid(), actor_id uuid not null,
 action text not null, entity_id uuid not null,
 merchant_id uuid, label text not null, created_at timestamptz not null default now()
);
create index if not exists admin_audit_created_idx on public.admin_audit(created_at desc);
alter table public.admin_audit enable row level security;
revoke all on public.admin_audit from public, anon, authenticated;
grant select,insert on public.admin_audit to service_role;

-- Revocation is checked on every admin request, independently of JWT expiry.
create table if not exists public.admin_sessions (
 id uuid primary key, user_id uuid not null references auth.users(id) on delete cascade,
 expires_at timestamptz not null, revoked_at timestamptz,
 created_at timestamptz not null default now()
);
alter table public.admin_sessions enable row level security;
revoke all on public.admin_sessions from public,anon,authenticated;
grant select,insert,update on public.admin_sessions to service_role;

create or replace function public.admin_save_merchant(
 p_actor uuid,p_id uuid,p_name text,p_email text,p_phone text,p_address text,
 p_subaccount text,p_expected timestamptz default null
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare m public.merchants; a uuid; creating boolean;
begin
 if p_actor is null or length(trim(p_name)) not between 1 and 120 or p_id is null then
  raise exception 'invalid merchant' using errcode='PA400';
 end if;
 if p_subaccount is not null and p_subaccount !~ '^ACCT_[A-Za-z0-9]{1,80}$' then
  raise exception 'invalid subaccount' using errcode='PA400';
 end if;
 perform pg_advisory_xact_lock(hashtextextended('admin-merchant:'||p_id::text,0));
 select * into m from public.merchants where id=p_id for update;
 creating=not found;
 if creating then
  if p_expected is not null then raise exception 'merchant missing' using errcode='PA404'; end if;
  insert into public.accounts(kind,currency) values('merchant','NGN') returning id into a;
  insert into public.merchants(id,name,account_id,contact_email,contact_phone,address,paystack_subaccount)
   values(p_id,trim(p_name),a,p_email,p_phone,p_address,p_subaccount) returning * into m;
 else
  if p_expected is null then
   if row(m.name,m.contact_email,m.contact_phone,m.address,m.paystack_subaccount) is not distinct from
     row(trim(p_name),p_email,p_phone,p_address,p_subaccount) then return to_jsonb(m); end if;
   raise exception 'request already used' using errcode='PA409';
  end if;
  if m.updated_at<>p_expected then raise exception 'merchant changed' using errcode='PA409'; end if;
  update public.merchants set name=trim(p_name),contact_email=p_email,contact_phone=p_phone,
   address=p_address,paystack_subaccount=p_subaccount,updated_at=clock_timestamp()
   where id=p_id returning * into m;
 end if;
 insert into public.admin_audit(actor_id,action,entity_id,merchant_id,label)
  values(p_actor,case when creating then 'merchant.created' else 'merchant.updated' end,p_id,p_id,m.name);
 return to_jsonb(m);
end $$;

create or replace function public.admin_save_terminal(
 p_actor uuid,p_id uuid,p_merchant uuid,p_label text,p_hash text,p_action text,p_expected timestamptz default null
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare t public.terminals;
begin
 if p_actor is null or p_id is null or p_action not in ('create','label','rotate','disable') then
  raise exception 'invalid terminal request' using errcode='PA400';
 end if;
 if p_action in ('create','label') and (p_label is null or length(trim(p_label)) not between 1 and 120) then
  raise exception 'invalid label' using errcode='PA400';
 end if;
 if p_action in ('create','rotate','disable') and (p_hash is null or p_hash !~ '^[0-9a-f]{64}$') then
  raise exception 'invalid key hash' using errcode='PA400';
 end if;
 perform pg_advisory_xact_lock(hashtextextended('admin-terminal:'||p_id::text,0));
 select * into t from public.terminals where id=p_id for update;
 if p_action='create' then
  if found then
   if row(t.merchant_id,t.label,t.api_key_hash) is not distinct from row(p_merchant,trim(p_label),p_hash) then
    return to_jsonb(t)-'api_key_hash';
   end if;
   raise exception 'terminal request already used' using errcode='PA409';
  end if;
  perform 1 from public.merchants where id=p_merchant;
  if not found then raise exception 'merchant missing' using errcode='PA404'; end if;
  insert into public.terminals(id,merchant_id,label,api_key_hash)
   values(p_id,p_merchant,trim(p_label),p_hash) returning * into t;
 else
  if not found then raise exception 'terminal missing' using errcode='PA404'; end if;
  -- Merchant association is immutable, including for disabled terminals.
  if p_merchant is not null and t.merchant_id<>p_merchant then raise exception 'merchant reassignment forbidden' using errcode='PA400'; end if;
  -- A retry after a lost rotation response must retain the generated key.
  if p_action='rotate' and t.api_key_hash=p_hash and t.disabled_at is null then return to_jsonb(t)-'api_key_hash'; end if;
  if p_expected is null or t.updated_at<>p_expected then raise exception 'terminal changed' using errcode='PA409'; end if;
  update public.terminals set
   label=case when p_action='label' then trim(p_label) else label end,
   api_key_hash=case when p_action in ('rotate','disable') then p_hash else api_key_hash end,
   disabled_at=case when p_action='disable' then clock_timestamp() when p_action='rotate' then null else disabled_at end,
   updated_at=clock_timestamp()
   where id=p_id returning * into t;
 end if;
 insert into public.admin_audit(actor_id,action,entity_id,merchant_id,label)
  values(p_actor,'terminal.'||case p_action when 'create' then 'created' when 'label' then 'updated' when 'rotate' then 'key_rotated' else 'disabled' end,p_id,t.merchant_id,t.label);
 return to_jsonb(t)-'api_key_hash';
end $$;
revoke execute on function public.admin_save_merchant(uuid,uuid,text,text,text,text,text,timestamptz) from public,anon,authenticated;
revoke execute on function public.admin_save_terminal(uuid,uuid,uuid,text,text,text,timestamptz) from public,anon,authenticated;
grant execute on function public.admin_save_merchant(uuid,uuid,text,text,text,text,text,timestamptz) to service_role;
grant execute on function public.admin_save_terminal(uuid,uuid,uuid,text,text,text,timestamptz) to service_role;
notify pgrst,'reload schema';
commit;
