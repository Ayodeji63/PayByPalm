insert into auth.users(id,email,email_confirmed_at) values
 ('aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa','admin@example.test',now()),
 ('bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb','owner@example.test',now()),
 ('cccccccc-cccc-4ccc-cccc-cccccccccccc','other@example.test',now()),
 ('dddddddd-dddd-4ddd-dddd-dddddddddddd','unverified@example.test',null);
insert into public.profiles(id) select id from auth.users;
select public.admin_save_merchant('aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111','Ayo Stores',null,null,null,null,null);
select public.admin_save_merchant('aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa','22222222-2222-4222-8222-222222222222','Other Business',null,null,null,null,null);
do $$begin
 begin
  perform public.admin_grant_merchant_access('aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111','unverified@example.test');raise exception 'unverified user granted';
 exception when sqlstate 'MA405' then null;end;
 begin
  perform public.admin_grant_merchant_access(null,'11111111-1111-4111-8111-111111111111','owner@example.test');raise exception 'null actor accepted';
 exception when sqlstate 'MA400' then null;end;
end $$;
select public.admin_grant_merchant_access('aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111','OWNER@example.test');
select public.admin_grant_merchant_access('aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111','owner@example.test');
do $$begin
 if (select count(*) from public.merchant_memberships)<>1 then raise exception 'duplicate grant';end if;
 if (select count(*) from public.admin_audit where action='merchant.access_granted')<>1 then raise exception 'duplicate grant audit';end if;
end $$;
insert into public.linked_cards(id) values('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee');
-- Use real charge-attempt table shapes, with deliberately different tenants and modes.
with fixtures(merchant,domain,amount,created) as (values
 ('11111111-1111-4111-8111-111111111111'::uuid,'live',5000,'2026-10-19T12:00:00Z'::timestamptz),
 ('11111111-1111-4111-8111-111111111111'::uuid,'live',1000,'2026-10-18T23:30:00Z'::timestamptz),
 ('11111111-1111-4111-8111-111111111111'::uuid,'live',90000,'2026-10-19T23:30:00Z'::timestamptz),
 ('11111111-1111-4111-8111-111111111111'::uuid,'test',77777,'2026-10-19T12:00:00Z'::timestamptz),
 ('22222222-2222-4222-8222-222222222222'::uuid,'live',99999,'2026-10-19T12:00:00Z'::timestamptz)),
 tx as (insert into public.transactions(merchant_id,amount_minor,status,created_at,description) select merchant,amount,'settled',created,domain from fixtures returning *)
insert into public.card_payment_attempts(transaction_id,user_id,card_id,reference,domain,amount_minor,signature_hash,status)
 select id,'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb','eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','pbp_pay_'||replace(id::text,'-',''),description,amount_minor,repeat('a',64),'success' from tx;
-- More than PostgREST's default row cap: aggregate must still include all rows.
with tx as (insert into public.transactions(merchant_id,amount_minor,status,created_at)
 select '11111111-1111-4111-8111-111111111111',1,'settled','2026-10-19T12:00:00Z' from generate_series(1,1001) returning *)
insert into public.card_payment_attempts(transaction_id,user_id,card_id,reference,domain,amount_minor,signature_hash,status)
 select id,'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb','eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','pbp_pay_'||replace(id::text,'-',''),'live',amount_minor,repeat('b',64),'success' from tx;
do $$declare report jsonb;begin
 report=public.merchant_report_snapshot('bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb','11111111-1111-4111-8111-111111111111','live','2026-10-18T23:00:00Z','2026-10-19T23:00:00Z');
 if (report->>'paidAmountMinor')::int<>7001 or (report->>'paidCount')::int<>1003 then raise exception 'tenant/mode/date/row-cap leak: %',report;end if;
 if report->'daily'->0->>'date'<>'2026-10-19' then raise exception 'wrong business timezone';end if;
 begin
  perform public.merchant_report_snapshot('bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb','22222222-2222-4222-8222-222222222222','live','2026-10-18T23:00:00Z','2026-10-19T23:00:00Z');raise exception 'other tenant accepted';
 exception when sqlstate 'MA403' then null;end;
 if exists(select 1 from information_schema.columns where table_schema='public' and table_name='merchant_payment_reports' and column_name in ('matched_user_id','authorization_ciphertext','signature_hash','api_key_hash','match_score')) then raise exception 'private reporting columns';end if;
 if has_table_privilege('anon','public.merchant_memberships','select') or has_table_privilege('authenticated','public.merchant_sessions','select') or has_table_privilege('authenticated','public.merchant_payment_reports','select') then raise exception 'browser access to service-only records';end if;
 if has_function_privilege('authenticated','public.admin_grant_merchant_access(uuid,uuid,text)','execute') or has_function_privilege('anon','public.merchant_report_snapshot(uuid,uuid,text,timestamptz,timestamptz)','execute') then raise exception 'public privileged RPC';end if;
end $$;
select public.admin_revoke_merchant_access('aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111','bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb',(select updated_at from public.merchant_memberships limit 1));
do $$begin
 begin
  perform public.merchant_report_snapshot('bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb','11111111-1111-4111-8111-111111111111','live','2026-10-18T23:00:00Z','2026-10-19T23:00:00Z');raise exception 'revocation ignored';
 exception when sqlstate 'MA403' then null;end;
end $$;
