begin;
insert into auth.users(id,email,raw_user_meta_data) values
 ('c1000000-0000-4000-8000-000000000001','card-one@example.test','{"full_name":"Card One","phone":"08099990010"}'),
 ('c1000000-0000-4000-8000-000000000002','card-two@example.test','{"full_name":"Card Two","phone":"08099990011"}');
insert into public.card_link_attempts(user_id,request_id,reference,email,domain,status) values
 ('c1000000-0000-4000-8000-000000000001',gen_random_uuid(),'card-one','card-one@example.test','test','pending'),
 ('c1000000-0000-4000-8000-000000000002',gen_random_uuid(),'card-two','card-two@example.test','test','pending');
do $$
declare v_card jsonb:='{"signature_hash":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","authorization_ciphertext":"ciphertext","bank":"Test Bank","brand":"visa","last4":"4081","exp_month":"12","exp_year":"2098"}';
 v_owner uuid:='c2000000-0000-4000-8000-000000000001'; v_other uuid:='c2000000-0000-4000-8000-000000000002'; v_id uuid;
begin
 if (select count(*) from public.claim_card_link('card-one',v_owner))<>1 then raise exception 'first claim failed'; end if;
 if (select count(*) from public.claim_card_link('card-one',v_other))<>0 then raise exception 'concurrent verification claim accepted'; end if;
 perform public.complete_card_link('card-one',v_owner,v_card,'123');
 perform public.complete_card_link('card-one',v_owner,v_card,'123');
 if (select count(*) from public.linked_cards)<>1 then raise exception 'verification replay duplicated card'; end if;
 select id into v_id from public.linked_cards where signature_hash=v_card->>'signature_hash';
 if public.edit_linked_card('c1000000-0000-4000-8000-000000000002',v_id,'remove') then raise exception 'another user removed the card'; end if;
 perform 1 from public.claim_card_link('card-two',v_other);
 perform public.complete_card_link('card-two',v_other,v_card,'456');
 if (select status from public.card_link_attempts where reference='card-two')<>'unsupported' then raise exception 'same card authorization linked to a different user'; end if;
 if not public.edit_linked_card('c1000000-0000-4000-8000-000000000001',v_id,'pause') then raise exception 'owner pause failed'; end if;
 if not (select is_paused from public.linked_cards where id=v_id) then raise exception 'pause not saved'; end if;
 perform public.edit_linked_card('c1000000-0000-4000-8000-000000000001',v_id,'remove');
 perform public.complete_card_link('card-one',v_owner,v_card,'123');
 if exists(select 1 from public.linked_cards where id=v_id and (removed_at is null or authorization_ciphertext is not null)) then raise exception 'replay resurrected a removed authorization'; end if;
 -- Request idempotency and one outstanding checkout are database constraints.
 begin
  insert into public.card_link_attempts(user_id,request_id,reference,email,domain)
   select user_id,request_id,'replayed','card-one@example.test','test' from public.card_link_attempts where reference='card-one';
  raise exception 'duplicate request accepted';
 exception when unique_violation then null; end;
end $$;
do $$
declare v_owner uuid:='c2000000-0000-4000-8000-000000000003'; v_next uuid:='c2000000-0000-4000-8000-000000000004'; v_id uuid;
 v_card jsonb:='{"signature_hash":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb","authorization_ciphertext":"ciphertext-two","bank":"Second Bank","brand":"verve","last4":"1234","exp_month":"11","exp_year":"2098"}';
begin
 insert into public.card_link_attempts(user_id,request_id,reference,email,domain,status) values
 ('c1000000-0000-4000-8000-000000000001',gen_random_uuid(),'card-three','card-one@example.test','test','pending');
 perform 1 from public.claim_card_link('card-three',v_owner);
 perform public.complete_card_link('card-three',v_owner,v_card,'789');
 select id into v_id from public.linked_cards where signature_hash=v_card->>'signature_hash';
 perform public.edit_linked_card('c1000000-0000-4000-8000-000000000001',v_id,'default');
 if (select count(*) from public.linked_cards where user_id='c1000000-0000-4000-8000-000000000001' and is_default and removed_at is null)<>1 then raise exception 'default card invariant broken'; end if;
 update public.card_link_attempts set lease_until=clock_timestamp()-interval '1 second' where reference='card-three';
 if (select count(*) from public.claim_card_link('card-three',v_next))<>1 then raise exception 'expired lease was not recoverable'; end if;
 begin
  perform public.complete_card_link('card-three',v_owner,v_card,'789');
  raise exception 'stale lease accepted' using errcode='check_violation';
 exception when raise_exception then null; end;
 insert into public.card_link_attempts(user_id,request_id,reference,email,domain) values
 ('c1000000-0000-4000-8000-000000000001',gen_random_uuid(),'card-open','card-one@example.test','test');
 begin
  insert into public.card_link_attempts(user_id,request_id,reference,email,domain) values
  ('c1000000-0000-4000-8000-000000000001',gen_random_uuid(),'card-extra','card-one@example.test','test');
  raise exception 'duplicate open checkout accepted';
 exception when unique_violation then null; end;
end $$;
set local role anon;
do $$
begin
 begin perform 1 from public.linked_cards; raise exception 'anonymous card read accepted'; exception when insufficient_privilege then null; end;
 begin perform 1 from public.card_link_attempts; raise exception 'anonymous attempt read accepted'; exception when insufficient_privilege then null; end;
 begin perform public.claim_card_link('card-one',gen_random_uuid()); raise exception 'anonymous card claim accepted'; exception when insufficient_privilege then null; end;
end $$;
reset role;
set local role authenticated;
do $$
begin
 begin perform authorization_ciphertext from public.linked_cards; raise exception 'client credential read accepted'; exception when insufficient_privilege then null; end;
 begin perform public.edit_linked_card(gen_random_uuid(),gen_random_uuid(),'remove'); raise exception 'client edit RPC accepted'; exception when insufficient_privilege then null; end;
end $$;
reset role;
rollback;
