-- Email is the authentication identity. Profile phones are self-reported lookup
-- hints for biometric candidate selection, not proof of ownership or login IDs.
-- A phone must not be reserved exclusively by an unrelated email signup.
alter table public.profiles drop constraint if exists profiles_phone_key;
comment on column public.profiles.phone is
  'Self-reported Nigerian phone for terminal candidate lookup; not verified and not an authentication identity.';

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public
as $$
declare v_full_name text; v_phone text;
begin
  v_full_name := nullif(trim(new.raw_user_meta_data ->> 'full_name'), '');
  -- Preserve native phone identities during the transition; disable new Phone
  -- Auth in hosted settings. New email accounts provide a profile phone only.
  v_phone := public.canonical_sms_phone(coalesce(nullif(new.phone, ''), new.raw_user_meta_data ->> 'phone'));
  if v_full_name is null or length(v_full_name) not between 2 and 120 or v_phone is null then
    raise exception 'signup requires a name and valid Nigerian profile phone'
      using errcode = 'invalid_parameter_value';
  end if;
  insert into public.profiles (id, full_name, phone) values (new.id, v_full_name, v_phone);
  insert into public.accounts (user_id, kind) values (new.id, 'user');
  return new;
end;
$$;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
notify pgrst, 'reload schema';
