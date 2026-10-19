begin;
do $$
declare actor uuid:='aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa'; merchant uuid:='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
 m jsonb; r jsonb; test_request uuid:=gen_random_uuid(); live_request uuid:=gen_random_uuid(); n bigint;
begin
 m:=public.admin_save_merchant(actor,merchant,'Payout Fixture',null,null,null,null,null);
 r:=public.admin_begin_payout(actor,merchant,'test',test_request,repeat('a',64),'058','Fixture Bank','6789','FIXTURE OWNER',0,(m->>'updated_at')::timestamptz);
 assert (r->>'claimed')::boolean,'first creation not claimed';
 r:=public.admin_begin_payout(actor,merchant,'test',gen_random_uuid(),repeat('a',64),'058','Fixture Bank','6789','FIXTURE OWNER',0,(m->>'updated_at')::timestamptz);
 assert not (r->>'claimed')::boolean,'creation replay obtained a second POST claim';
 assert (r->'setup'->>'request_id')::uuid=test_request,'replay changed provider correlation';
 begin
  perform public.admin_begin_payout(actor,merchant,'test',gen_random_uuid(),repeat('b',64),'058','Fixture Bank','9999','DIFFERENT OWNER',0,(m->>'updated_at')::timestamptz);
  raise exception 'TEST FAILED: changed bank accepted during ambiguous creation';
 exception when sqlstate 'PA409' then null; end;
 r:=public.admin_complete_payout(actor,merchant,'test',test_request,'ACCT_testFixture',false,true);
 assert r->'merchant'->>'paystack_subaccount' is null,'test creation changed live destination';
 assert r->'merchant'->>'paystack_test_subaccount'='ACCT_testFixture','test code not stored';
 assert r->'setup'->>'status'='created' and not (r->'setup'->>'provider_verified')::boolean,'bank name resolution falsely approved Paystack payouts';
 select count(*) into n from public.admin_audit where action='merchant.payout_created' and merchant_id=merchant;
 perform public.admin_complete_payout(actor,merchant,'test',test_request,'ACCT_testFixture',true,true);
 assert (select count(*) from public.admin_audit where action='merchant.payout_created' and merchant_id=merchant)=n,'replay duplicated creation audit';
 m:=r->'merchant';
 r:=public.admin_begin_payout(actor,merchant,'live',live_request,repeat('b',64),'058','Fixture Bank','6789','FIXTURE OWNER',0,(m->>'updated_at')::timestamptz);
 assert (r->>'claimed')::boolean,'test setup blocked live setup';
 r:=public.admin_complete_payout(actor,merchant,'live',live_request,'ACCT_liveFixture',false,true);
 assert r->'merchant'->>'paystack_subaccount'='ACCT_liveFixture','live code not stored';
 assert r->'merchant'->>'paystack_test_subaccount'='ACCT_testFixture','live completion overwrote test destination';
 begin
  perform public.admin_complete_payout(actor,merchant,'live',live_request,'ACCT_replacement',true,true);
  raise exception 'TEST FAILED: payout destination replaced on replay';
 exception when sqlstate 'PA409' then null; end;
 assert not has_table_privilege('authenticated','public.merchant_payout_setups','SELECT'),'browser can read bank setup records';
 assert not has_function_privilege('authenticated','public.admin_begin_payout(uuid,uuid,text,uuid,text,text,text,text,text,numeric,timestamptz)','EXECUTE'),'browser can create payout claims';
 assert not has_function_privilege('anon','public.admin_complete_payout(uuid,uuid,text,uuid,text,boolean,boolean)','EXECUTE'),'anonymous caller can bind payout accounts';
end $$;
rollback;
