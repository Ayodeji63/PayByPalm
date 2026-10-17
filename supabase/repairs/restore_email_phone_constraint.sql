-- Hosted repair for signup failing with SQLSTATE 23505 / profiles_phone_key.
-- Matches migration 0014: email is the Auth identity, phone is a lookup hint.
-- Safe to rerun. Does not delete, merge or update profiles, users or wallets.
alter table public.profiles drop constraint if exists profiles_phone_key;
