-- Merchant reporting identities are explicit grants, never email-domain or metadata roles.
-- Additive and rerunnable. Apply after admin migrations 0020/0023 and payment mode 0022.
begin;
create table if not exists public.merchant_memberships (
 id uuid not null unique default gen_random_uuid(),
 merchant_id uuid not null references public.merchants(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 granted_by uuid not null references auth.users(id),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(), revoked_at timestamptz,
 primary key(merchant_id,user_id)
);
create index if not exists merchant_memberships_active_user on public.merchant_memberships(user_id,merchant_id) where revoked_at is null;
alter table public.merchant_memberships enable row level security;
revoke all on public.merchant_memberships from public,anon,authenticated;
grant select,insert,update on public.merchant_memberships to service_role;

create table if not exists public.merchant_sessions (
 id uuid primary key, user_id uuid not null references auth.users(id) on delete cascade,
 expires_at timestamptz not null, revoked_at timestamptz, created_at timestamptz not null default now()
);
alter table public.merchant_sessions enable row level security;
revoke all on public.merchant_sessions from public,anon,authenticated;
grant select,insert,update on public.merchant_sessions to service_role;

-- Deliberately omits payer IDs, images, scores, card tokens and terminal credentials.
-- Only charge attempts have an authoritative mode; abandoned scans are not card payments.
create or replace view public.merchant_payment_reports with (security_invoker=true) as
 select t.id,t.merchant_id,t.terminal_id,t.amount_minor,t.description,t.status,
        t.created_at,t.settled_at,a.reference,a.domain,
        case when d.merchant_id=t.merchant_id then d.label else null end as terminal_label
 from public.transactions t join public.card_payment_attempts a on a.transaction_id=t.id
 left join public.terminals d on d.id=t.terminal_id;
revoke all on public.merchant_payment_reports from public,anon,authenticated;
grant select on public.merchant_payment_reports to service_role;
create index if not exists transactions_merchant_reporting on public.transactions(merchant_id,created_at desc,id desc);

create or replace function public.admin_grant_merchant_access(p_actor uuid,p_merchant uuid,p_email text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare u uuid; m public.merchant_memberships;
begin
 if p_actor is null or p_merchant is null or p_email is null or length(trim(p_email)) not between 3 and 254 then raise exception 'invalid access grant' using errcode='MA400'; end if;
 perform 1 from auth.users where id=p_actor and email_confirmed_at is not null;
 if not found then raise exception 'invalid actor' using errcode='MA400'; end if;
 perform 1 from public.merchants where id=p_merchant;
 if not found then raise exception 'merchant missing' using errcode='MA404'; end if;
 select id into u from auth.users where lower(email)=lower(trim(p_email)) and email_confirmed_at is not null;
 if u is null then raise exception 'verified account required' using errcode='MA405'; end if;
 perform pg_advisory_xact_lock(hashtextextended('merchant-access:'||p_merchant::text||':'||u::text,0));
 select * into m from public.merchant_memberships where merchant_id=p_merchant and user_id=u for update;
 if found and m.revoked_at is null then return jsonb_build_object('id',m.id,'user_id',u,'email',lower(trim(p_email)),'created_at',m.created_at,'updated_at',m.updated_at); end if;
 insert into public.merchant_memberships(merchant_id,user_id,granted_by) values(p_merchant,u,p_actor)
 on conflict(merchant_id,user_id) do update set revoked_at=null,granted_by=p_actor,updated_at=clock_timestamp() returning * into m;
 insert into public.admin_audit(actor_id,action,entity_id,merchant_id,label) values(p_actor,'merchant.access_granted',m.id,p_merchant,'Merchant portal access granted');
 return jsonb_build_object('id',m.id,'user_id',u,'email',lower(trim(p_email)),'created_at',m.created_at,'updated_at',m.updated_at);
end $$;
create or replace function public.admin_list_merchant_access(p_merchant uuid)
returns jsonb language sql security definer set search_path=public,pg_temp as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',m.id,'user_id',m.user_id,'email',u.email,'created_at',m.created_at,'updated_at',m.updated_at) order by m.created_at),'[]'::jsonb)
 from public.merchant_memberships m join auth.users u on u.id=m.user_id where m.merchant_id=p_merchant and m.revoked_at is null;
$$;
create or replace function public.admin_revoke_merchant_access(p_actor uuid,p_merchant uuid,p_user uuid,p_expected timestamptz)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare m public.merchant_memberships;
begin
 if p_actor is null or p_merchant is null or p_user is null or p_expected is null then raise exception 'invalid access revocation' using errcode='MA400'; end if;
 perform 1 from auth.users where id=p_actor and email_confirmed_at is not null;
 if not found then raise exception 'invalid actor' using errcode='MA400'; end if;
 perform pg_advisory_xact_lock(hashtextextended('merchant-access:'||p_merchant::text||':'||p_user::text,0));
 select * into m from public.merchant_memberships where merchant_id=p_merchant and user_id=p_user for update;
 if not found then raise exception 'access missing' using errcode='MA404'; end if;
 if m.revoked_at is not null then return; end if;
 if m.updated_at<>p_expected then raise exception 'access changed' using errcode='MA409'; end if;
 update public.merchant_memberships set revoked_at=clock_timestamp(),updated_at=clock_timestamp() where id=m.id;
 insert into public.admin_audit(actor_id,action,entity_id,merchant_id,label) values(p_actor,'merchant.access_revoked',m.id,p_merchant,'Merchant portal access revoked');
end $$;

create or replace function public.merchant_report_snapshot(p_user uuid,p_merchant uuid,p_domain text,p_from timestamptz,p_to timestamptz)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare result jsonb; daily jsonb;
begin
 if p_domain not in ('test','live') or p_domain is null or p_from is null or p_to is null or p_to<=p_from or p_to-p_from>interval '366 days' then raise exception 'invalid period' using errcode='MA400'; end if;
 perform 1 from public.merchant_memberships where user_id=p_user and merchant_id=p_merchant and revoked_at is null;
 if not found then raise exception 'merchant access required' using errcode='MA403'; end if;
 select jsonb_build_object('paidAmountMinor',coalesce(sum(amount_minor) filter(where status='settled'),0),'paidCount',count(*) filter(where status='settled'),
   'pendingCount',count(*) filter(where status in ('pending','authenticated','processing')),'failedCount',count(*) filter(where status='failed'),'totalCount',count(*)) into result
 from public.merchant_payment_reports where merchant_id=p_merchant and domain=p_domain and created_at>=p_from and created_at<p_to;
 select coalesce(jsonb_agg(jsonb_build_object('date',d.day::date,'amountMinor',coalesce(v.amount,0),'count',coalesce(v.count,0)) order by d.day),'[]'::jsonb) into daily
 from generate_series((p_from at time zone 'Africa/Lagos')::date,((p_to-interval '1 second') at time zone 'Africa/Lagos')::date,interval '1 day') d(day)
 left join (select (created_at at time zone 'Africa/Lagos')::date as day,sum(amount_minor) as amount,count(*) as count from public.merchant_payment_reports
  where merchant_id=p_merchant and domain=p_domain and status='settled' and created_at>=p_from and created_at<p_to group by 1) v on v.day=d.day::date;
 return result||jsonb_build_object('daily',daily);
end $$;
revoke execute on function public.admin_grant_merchant_access(uuid,uuid,text),public.admin_list_merchant_access(uuid),public.admin_revoke_merchant_access(uuid,uuid,uuid,timestamptz),public.merchant_report_snapshot(uuid,uuid,text,timestamptz,timestamptz) from public,anon,authenticated;
grant execute on function public.admin_grant_merchant_access(uuid,uuid,text),public.admin_list_merchant_access(uuid),public.admin_revoke_merchant_access(uuid,uuid,uuid,timestamptz),public.merchant_report_snapshot(uuid,uuid,text,timestamptz,timestamptz) to service_role;
notify pgrst,'reload schema';
commit;
