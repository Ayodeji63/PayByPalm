\set ON_ERROR_STOP on
begin;
insert into auth.users(id,email,raw_user_meta_data) values
 ('e1000000-0000-4000-8000-000000000001','mode-owner@example.test','{"full_name":"Mode Owner","phone":"08088000101"}'),
 ('e1000000-0000-4000-8000-000000000002','mode-other@example.test','{"full_name":"Other Owner","phone":"08088000102"}');
create function pg_temp.mode_card(p_user uuid,p_mode text,p_signature text) returns uuid language plpgsql as $$
declare ref text:='mode_'||replace(gen_random_uuid()::text,'-',''); owner uuid:=gen_random_uuid(); card uuid;
begin
 insert into public.card_link_attempts(user_id,request_id,reference,email,domain,status,lease_owner,lease_until)
 values(p_user,gen_random_uuid(),ref,'mode@example.test',p_mode,'pending',owner,clock_timestamp()+interval '2 minutes');
 perform public.complete_card_link(ref,owner,jsonb_build_object('signature_hash',p_signature,'authorization_ciphertext','encrypted-fixture','bank','Fixture Bank','brand','visa','last4','1234','exp_month','12','exp_year','2099'),'fixture-provider-id');
 select card_id into card from public.card_link_attempts where reference=ref;
 return card;
end $$;
do $$
declare payer uuid:='e1000000-0000-4000-8000-000000000001'; other uuid:='e1000000-0000-4000-8000-000000000002';
 test1 uuid; test2 uuid; live1 uuid; terminal uuid; t public.transactions; a public.card_payment_attempts;
begin
 test1:=pg_temp.mode_card(payer,'test',repeat('a',64));
 live1:=pg_temp.mode_card(payer,'live',repeat('a',64));
 assert test1<>live1,'same fingerprint overwrote a credential across modes';
 assert (select is_default from public.linked_cards where id=test1),'test default missing';
 assert (select is_default from public.linked_cards where id=live1),'live default missing';
 test2:=pg_temp.mode_card(payer,'test',repeat('b',64));
 perform public.edit_linked_card(payer,test2,'default');
 assert (select not is_default from public.linked_cards where id=test1),'old test default retained';
 assert (select is_default from public.linked_cards where id=test2),'new test default missing';
 assert (select is_default from public.linked_cards where id=live1),'test default update changed live default';
 assert pg_temp.mode_card(other,'test',repeat('a',64)) is null,'same-mode ownership isolation lost';
 assert (select user_id from public.linked_cards where id=test1)=payer,'card owner overwritten';
 -- Unfinished checkout in one mode cannot block the other mode.
 insert into public.card_link_attempts(user_id,request_id,reference,email,domain)
 values(payer,gen_random_uuid(),'mode-open-test','mode@example.test','test'),(payer,gen_random_uuid(),'mode-open-live','mode@example.test','live');
 begin
  insert into public.card_link_attempts(user_id,request_id,reference,email,domain)
  values(payer,gen_random_uuid(),'mode-open-test-duplicate','mode@example.test','test');
  raise exception 'TEST FAILED: duplicate same-mode checkout accepted';
 exception when unique_violation then null; end;
 update public.profiles set palm_enrolled=true where id=payer;
 select id into terminal from public.terminals limit 1;
 update public.merchants set paystack_subaccount='ACCT_modefixture' where id=(select merchant_id from public.terminals where id=terminal);
 t:=public.create_terminal_transaction(terminal,gen_random_uuid(),5000,'Mode-isolated purchase');
 update public.transactions set status='authenticated',matched_user_id=payer,match_score=95,match_mode='compare',payment_card_id=test2 where id=t.id;
 begin
  perform public.begin_card_payment(t.id,terminal,'live',60,85);
  raise exception 'TEST FAILED: test credential accepted for live payment';
 exception when sqlstate 'PB008' then null; end;
 select * into a from public.begin_card_payment(t.id,terminal,'test',60,85);
 assert a.domain='test' and a.subaccount is null,'sandbox attempted to use live settlement configuration';
 t:=public.create_terminal_transaction(terminal,gen_random_uuid(),5000,'Live purchase fixture');
 update public.transactions set status='authenticated',matched_user_id=payer,match_score=95,match_mode='compare',payment_card_id=live1 where id=t.id;
 select * into a from public.begin_card_payment(t.id,terminal,'live',60,85);
 assert a.card_id=live1 and a.domain='live','live payment selected wrong credential';
 assert (select count(*) from public.begin_card_payment(t.id,terminal,'live',60,85))=0,'mode isolation broke idempotency';
 assert not public.edit_linked_card(other,live1,'remove'),'another owner edited the live card';
 perform public.edit_linked_card(payer,test2,'remove');
 assert (select authorization_ciphertext is not null and removed_at is null from public.linked_cards where id=live1),'removing test card removed live credential';
 assert not has_table_privilege('authenticated','public.linked_cards','SELECT'),'browser can read tokens';
end $$;
rollback;
