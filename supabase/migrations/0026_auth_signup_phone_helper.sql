-- Repair hosted projects missing the older 0013 helper used by signup.
-- No existing identities, profiles, phones or payment data are changed.
begin;
set local lock_timeout = '10s';
set local statement_timeout = '30s';

create or replace function public.canonical_sms_phone(p_phone text) returns text
language sql immutable set search_path = pg_catalog
as $$
  select case
    when regexp_replace(p_phone, '[^0-9]', '', 'g') ~ '^234[0-9]{10}$'
      then '0' || right(regexp_replace(p_phone, '[^0-9]', '', 'g'), 10)
    when p_phone ~ '^0[0-9]{10}$' then p_phone
    else null end;
$$;
revoke execute on function public.canonical_sms_phone(text) from public, anon, authenticated;
comment on function public.canonical_sms_phone(text) is
  'Normalize Nigerian phones for atomic PayByPalm profile provisioning.';

notify pgrst, 'reload schema';
commit;
