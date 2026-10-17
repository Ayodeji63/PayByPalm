-- Disable the published development credential without deleting device records
-- or breaking foreign keys from historical transactions and enrolment sessions.
update public.terminals
set api_key_hash = 'revoked:' || id::text
where api_key_hash = '4093fc76e48a3db5c7db148e448d692bb996cf965c04a6729f9f992aeb3e836b';
