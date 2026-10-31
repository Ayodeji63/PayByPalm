-- Private customer feedback; only an administrator can publish a reviewed version.
begin;
create table public.customer_feedback (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null unique references pbp_auth."user"(id) on delete cascade,
 rating smallint not null check(rating between 1 and 5),
 comment text not null check(char_length(btrim(comment)) between 1 and 2000),
 created_at timestamptz not null default clock_timestamp(),
 updated_at timestamptz not null default clock_timestamp(),
 published_at timestamptz,
 reviewed_by uuid references pbp_auth."user"(id),
 check(published_at is null or reviewed_by is not null)
);
create index customer_feedback_public on public.customer_feedback(published_at desc,id) where published_at is not null;
alter table public.customer_feedback enable row level security;
revoke all on public.customer_feedback from public,anon,authenticated;
grant select,insert,update on public.customer_feedback to service_role;

-- Every customer edit invalidates publication, including updates from old clients.
create function public.reset_feedback_publication() returns trigger
language plpgsql set search_path=public,pg_temp as $$
begin
 if new.rating is distinct from old.rating or new.comment is distinct from old.comment then
  new.published_at:=null; new.reviewed_by:=null;
 end if;
 new.updated_at:=clock_timestamp();
 return new;
end $$;
create trigger customer_feedback_edit before update on public.customer_feedback
 for each row execute function public.reset_feedback_publication();
revoke all on function public.reset_feedback_publication() from public,anon,authenticated;
commit;
