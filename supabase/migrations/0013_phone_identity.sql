-- Native phone identities must use the Auth-owned phone, never editable metadata.
create function public.canonical_sms_phone(p_phone text) returns text
language sql immutable set search_path = public
as $$
  select case
    when regexp_replace(p_phone, '[^0-9]', '', 'g') ~ '^234[0-9]{10}$'
      then '0' || right(regexp_replace(p_phone, '[^0-9]', '', 'g'), 10)
    when p_phone ~ '^0[0-9]{10}$' then p_phone
    else null end;
$$;
revoke execute on function public.canonical_sms_phone(text) from public, anon, authenticated;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public
as $$
declare v_full_name text; v_phone text;
begin
  v_full_name := nullif(trim(new.raw_user_meta_data ->> 'full_name'), '');
  if nullif(new.phone, '') is not null then
    v_phone := public.canonical_sms_phone(new.phone);
  else
    -- Legacy synthetic-email accounts are provisioned only through trusted admin tools.
    -- Public email signup must remain disabled in Supabase Auth settings.
    v_phone := nullif(trim(new.raw_user_meta_data ->> 'phone'), '');
  end if;
  if v_full_name is null or v_phone is null then
    raise exception 'signup requires a name and a valid phone identity'
      using errcode = 'invalid_parameter_value';
  end if;
  insert into public.profiles (id, full_name, phone) values (new.id, v_full_name, v_phone);
  insert into public.accounts (user_id, kind) values (new.id, 'user');
  return new;
end;
$$;
revoke execute on function public.handle_new_user() from public, anon, authenticated;

create function public.sync_confirmed_phone() returns trigger
language plpgsql security definer set search_path = public
as $$
declare v_phone text;
begin
  if new.phone_confirmed_at is not null and nullif(new.phone, '') is not null then
    v_phone := public.canonical_sms_phone(new.phone);
    if v_phone is null then
      raise exception 'unsupported phone identity' using errcode = 'invalid_parameter_value';
    end if;
    update public.profiles set phone = v_phone where id = new.id and phone is distinct from v_phone;
  end if;
  return new;
end;
$$;
revoke execute on function public.sync_confirmed_phone() from public, anon, authenticated;
create trigger on_confirmed_phone_changed after update of phone, phone_confirmed_at on auth.users
for each row execute function public.sync_confirmed_phone();
