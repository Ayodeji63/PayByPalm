-- All test identities roll back; never apply this test to a live project.
begin;
do $$
declare v_id uuid := gen_random_uuid(); v_bad uuid := gen_random_uuid();
begin
  insert into auth.users (id, phone, raw_user_meta_data)
    values (v_id, '2348099990001', '{"full_name":"SMS User","phone":"08099990002"}');
  if (select phone from public.profiles where id = v_id) <> '08099990001' then
    raise exception 'profile trusted editable metadata over Auth phone';
  end if;
  update auth.users set raw_user_meta_data = '{"full_name":"SMS User","phone":"08099990003"}' where id = v_id;
  if (select phone from public.profiles where id = v_id) <> '08099990001' then
    raise exception 'metadata changed trusted profile phone';
  end if;
  update auth.users set phone = '2348099990004', phone_confirmed_at = now() where id = v_id;
  if (select phone from public.profiles where id = v_id) <> '08099990004' then
    raise exception 'confirmed phone did not synchronize';
  end if;
  begin
    insert into auth.users (id, phone, raw_user_meta_data)
      values (v_bad, '123', '{"full_name":"Invalid User","phone":"08099990005"}');
    raise exception 'invalid native phone was accepted';
  exception when invalid_parameter_value then null;
  end;
  if exists(select 1 from auth.users where id = v_bad) or exists(select 1 from public.accounts where user_id = v_bad) then
    raise exception 'invalid signup left partial state';
  end if;
end $$;
rollback;
