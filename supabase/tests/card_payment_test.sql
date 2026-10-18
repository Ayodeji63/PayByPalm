\set ON_ERROR_STOP on
begin;
insert into auth.users(id,email,raw_user_meta_data) values('d1000000-0000-4000-8000-000000000001','direct-card@example.test','{"full_name":"Direct Card","phone":"08099990020"}');
update public.profiles set palm_enrolled=true where id='d1000000-0000-4000-8000-000000000001';
insert into public.linked_cards(id,user_id,signature_hash,authorization_ciphertext,bank,brand,last4,exp_month,exp_year,is_default)
values('d2000000-0000-4000-8000-000000000001','d1000000-0000-4000-8000-000000000001',repeat('c',64),'encrypted','Test Bank','visa','4081','12','2098',true);
insert into public.card_link_attempts(user_id,request_id,reference,email,domain,status,card_id)
values('d1000000-0000-4000-8000-000000000001',gen_random_uuid(),'direct-card-link','direct-card@example.test','test','verified','d2000000-0000-4000-8000-000000000001');
do $$
declare terminal uuid; t public.transactions; a public.card_payment_attempts; n bigint;
begin
 select id into terminal from public.terminals limit 1;
 t:=public.create_terminal_transaction(terminal,gen_random_uuid(),5000,'Direct card purchase');
 update public.transactions set status='authenticated',matched_user_id='d1000000-0000-4000-8000-000000000001',match_score=92,match_mode='search',payment_card_id='d2000000-0000-4000-8000-000000000001' where id=t.id;
 begin
  perform public.begin_card_payment(t.id,gen_random_uuid(),'test',60,85);
  raise exception 'TEST FAILED: terminal ownership bypass';
 exception when sqlstate 'PB001' then null; end;
 begin
  perform public.begin_card_payment(t.id,terminal,'live',60,85);
  raise exception 'TEST FAILED: unconfigured live settlement accepted';
 exception when sqlstate 'PB009' then null; end;
 select count(*) into n from public.ledger_entries;
 select * into a from public.begin_card_payment(t.id,terminal,'test',60,85);
 assert a.reference ~ '^pbp_pay_[a-f0-9]{32}$','invalid provider reference';
 assert a.amount_minor=5000 and a.user_id='d1000000-0000-4000-8000-000000000001','charge binding lost';
 assert (select status from public.transactions where id=t.id)='processing','charge did not reserve sale';
 assert (select count(*) from public.begin_card_payment(t.id,terminal,'test',60,85))=0,'replay obtained a second charge claim';
 begin
  update public.transactions set status='cancelled' where id=t.id;
  raise exception 'TEST FAILED: initiated charge cancelled';
 exception when sqlstate 'PB002' then null; end;
 begin
  update public.transactions set payment_card_id=null where id=t.id;
  raise exception 'TEST FAILED: authenticated card changed';
 exception when sqlstate 'PB002' then null; end;
 perform public.finish_card_payment(a.reference,'pending');
 assert (select status from public.transactions where id=t.id)='processing','pending charge falsely settled';
 perform public.finish_card_payment(a.reference,'success','123456789');
 perform public.finish_card_payment(a.reference,'failed');
 assert (select status from public.transactions where id=t.id)='settled','successful charge overwritten';
 assert (select count(*) from public.ledger_entries)=n,'card payment mutated internal ledger';
 assert (select authorization_ciphertext from public.card_payment_attempts where transaction_id=t.id) is null,'finished attempt kept credentials';
 -- Paused and changed defaults cannot be substituted after the palm match.
 t:=public.create_terminal_transaction(terminal,gen_random_uuid(),5000,'Paused card');
 update public.transactions set status='authenticated',matched_user_id='d1000000-0000-4000-8000-000000000001',match_score=92,match_mode='search',payment_card_id='d2000000-0000-4000-8000-000000000001' where id=t.id;
 perform public.edit_linked_card('d1000000-0000-4000-8000-000000000001','d2000000-0000-4000-8000-000000000001','pause');
 begin
  perform public.begin_card_payment(t.id,terminal,'test',60,85);
  raise exception 'TEST FAILED: paused card charged';
 exception when sqlstate 'PB008' then null; end;
 perform public.edit_linked_card('d1000000-0000-4000-8000-000000000001','d2000000-0000-4000-8000-000000000001','resume');
 begin
  perform public.begin_card_payment(t.id,terminal,'test',60,95);
  raise exception 'TEST FAILED: weak match charged';
 exception when sqlstate 'PB005' then null; end;
 -- App role can no longer create/debit stored-value funds.
 assert not has_function_privilege('service_role','public.post_transaction(uuid,integer)','EXECUTE'),'legacy ledger debit still enabled';
 assert not has_function_privilege('service_role','public.post_topup(uuid,bigint,text)','EXECUTE'),'legacy funding still enabled';
 assert not has_function_privilege('authenticated','public.begin_card_payment(uuid,uuid,text,integer,integer)','EXECUTE'),'browser can initiate token charge';
end $$;
set local role authenticated;
do $$begin
 begin perform * from public.card_payment_attempts; raise exception 'TEST FAILED: browser reads charge tokens'; exception when insufficient_privilege then null; end;
end $$;
reset role;
rollback;
