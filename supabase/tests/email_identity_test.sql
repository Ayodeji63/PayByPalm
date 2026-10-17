begin;
do $$
declare a uuid := gen_random_uuid(); b uuid := gen_random_uuid(); bad uuid := gen_random_uuid();
begin
  insert into auth.users(id,email,raw_user_meta_data) values
    (a,'email-one@example.test','{"full_name":"Email One","phone":"+2348099990010"}'),
    (b,'email-two@example.test','{"full_name":"Email Two","phone":"08099990010"}');
  if (select count(*) from public.profiles where phone='08099990010') <> 2 then
    raise exception 'self-reported phone must not reserve another email owner identity';
  end if;
  if (select count(*) from public.accounts where user_id in (a,b)) <> 2 then
    raise exception 'email identities must get separate wallets';
  end if;
  update auth.users set raw_user_meta_data='{"full_name":"Email One","phone":"08099990011"}' where id=a;
  if (select phone from public.profiles where id=a) <> '08099990010' then
    raise exception 'editable metadata changed profile identity';
  end if;
  begin
    insert into auth.users(id,email,raw_user_meta_data) values (bad,'bad@example.test','{"full_name":"Bad Phone","phone":"invalid"}');
    raise exception 'invalid signup phone was accepted';
  exception when invalid_parameter_value then null;
  end;
  if exists(select 1 from public.accounts where user_id=bad) then raise exception 'invalid signup left a partial wallet'; end if;
end $$;
rollback;
