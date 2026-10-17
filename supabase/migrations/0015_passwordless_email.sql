-- Email-only signup must not require a name/phone or invent a phone identity.
alter table public.profiles alter column phone drop not null;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public
as $$
declare v_name text; v_phone text;
begin
  v_name := left(coalesce(nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''), 'Wallet user'), 120);
  v_phone := public.canonical_sms_phone(coalesce(nullif(new.phone, ''), new.raw_user_meta_data ->> 'phone'));
  if nullif(new.phone, '') is not null and v_phone is null then
    raise exception 'unsupported native phone identity' using errcode = 'invalid_parameter_value';
  end if;
  insert into public.profiles (id, full_name, phone) values (new.id, v_name, v_phone);
  insert into public.accounts (user_id, kind) values (new.id, 'user');
  return new;
end;
$$;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
notify pgrst, 'reload schema';
