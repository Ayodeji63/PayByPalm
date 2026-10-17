-- Reproduce a partially migrated hosted schema and exercise the exact repair.
begin;
insert into auth.users(id,email,raw_user_meta_data) values
 ('d1000000-0000-4000-8000-000000000001','repair-one@example.test','{"full_name":"Repair One","phone":"08099990010"}');
create temp table repair_original_profile as
 select * from public.profiles where id='d1000000-0000-4000-8000-000000000001';
create temp table repair_original_wallet as
 select * from public.accounts where user_id='d1000000-0000-4000-8000-000000000001';
alter table public.profiles add constraint profiles_phone_key unique(phone);
do $$
begin
 begin
  insert into auth.users(id,email,raw_user_meta_data) values
   ('d1000000-0000-4000-8000-000000000002','repair-two@example.test','{"full_name":"Repair Two","phone":"08099990010"}');
  raise exception 'expected stale phone constraint to reject signup';
 exception when unique_violation then null;
 end;
 if exists(select 1 from auth.users where id='d1000000-0000-4000-8000-000000000002') or
    exists(select 1 from public.accounts where user_id='d1000000-0000-4000-8000-000000000002') then
  raise exception 'rejected signup left partial records';
 end if;
end $$;
\ir restore_email_phone_constraint.sql
\ir restore_email_phone_constraint.sql
insert into auth.users(id,email,raw_user_meta_data) values
 ('d1000000-0000-4000-8000-000000000002','repair-two@example.test','{"full_name":"Repair Two","phone":"08099990010"}');
do $$
begin
 if (select count(*) from public.profiles where phone='08099990010') <> 2 or
    (select count(*) from public.accounts where user_id in ('d1000000-0000-4000-8000-000000000001','d1000000-0000-4000-8000-000000000002')) <> 2 then
  raise exception 'repair did not allow separate email wallets with a shared profile phone';
 end if;
 if exists(select * from repair_original_profile except select * from public.profiles) or
    exists(select * from repair_original_wallet except select * from public.accounts) then
  raise exception 'repair modified the existing profile or wallet';
 end if;
end $$;
rollback;
