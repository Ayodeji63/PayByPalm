-- 0001_extensions.sql
-- PayByPalm — required extensions.
--
-- pgcrypto provides gen_random_uuid(), used as the default for every primary key.
-- Supabase ships this pre-installed on most projects; the guard makes the
-- migration safe to run against a bare Postgres too.

create extension if not exists pgcrypto;
