-- Disposable PostgreSQL only. No external provider calls or real biometric data.
insert into auth.users(id,email,raw_user_meta_data) values
 ('11111111-1111-4111-8111-111111111111','h5-test@example.invalid','{"full_name":"H5 Pilot","phone":"+2348012345678"}');
insert into public.terminals(id,merchant_id,label,api_key_hash)
 select '22222222-2222-4222-8222-222222222222',id,'H5 test',repeat('f',64) from public.merchants limit 1;

do $$
declare
 u uuid := '11111111-1111-4111-8111-111111111111';
 t uuid := '22222222-2222-4222-8222-222222222222';
 scope uuid := gen_random_uuid(); c uuid; c2 uuid; s uuid; s2 uuid; rejected boolean; who text;
begin
 foreach who in array array['anon','authenticated'] loop
  assert not has_table_privilege(who,'public.palm_capture_sessions','SELECT'), 'capture grant exposed';
  assert not has_table_privilege(who,'public.palm_used_captures','INSERT'), 'replay table exposed';
  assert not has_function_privilege(who,'public.consume_palm_capture(uuid,uuid,uuid,text,text,text)','EXECUTE'), 'capture RPC exposed';
  assert not has_function_privilege(who,'public.complete_h5_palm_enrolment(uuid,uuid,uuid,text)','EXECUTE'), 'enrol RPC exposed';
 end loop;
 insert into public.palm_capture_sessions(terminal_id,user_id,purpose,scope_id,token_hash,expires_at)
 values(t,u,'payment',scope,repeat('a',64),clock_timestamp()+interval '60 seconds') returning id into c;
 rejected := false;
 begin perform public.consume_palm_capture(c,gen_random_uuid(),scope,'payment',repeat('a',64),repeat('b',64));
 exception when sqlstate 'PC001' then rejected := true; end;
 assert rejected, 'wrong terminal accepted';
 rejected := false;
 begin perform public.consume_palm_capture(c,t,gen_random_uuid(),'payment',repeat('a',64),repeat('b',64));
 exception when sqlstate 'PC001' then rejected := true; end;
 assert rejected, 'wrong sale accepted';
 rejected := false;
 begin perform public.consume_palm_capture(c,t,scope,'enrol',repeat('a',64),repeat('b',64));
 exception when sqlstate 'PC001' then rejected := true; end;
 assert rejected, 'wrong purpose accepted';
 rejected := false;
 begin perform public.consume_palm_capture(c,t,scope,'payment',repeat('c',64),repeat('b',64));
 exception when sqlstate 'PC001' then rejected := true; end;
 assert rejected, 'wrong token accepted';
 assert public.consume_palm_capture(c,t,scope,'payment',repeat('a',64),repeat('b',64)) = u;
 rejected := false;
 begin perform public.consume_palm_capture(c,t,scope,'payment',repeat('a',64),repeat('d',64));
 exception when sqlstate 'PC001' then rejected := true; end;
 assert rejected, 'grant replay accepted';

 insert into public.palm_capture_sessions(terminal_id,user_id,purpose,scope_id,token_hash,expires_at)
 values(t,u,'payment',scope,repeat('a',64),clock_timestamp()+interval '60 seconds') returning id into c2;
 rejected := false;
 begin perform public.consume_palm_capture(c2,t,scope,'payment',repeat('a',64),repeat('b',64));
 exception when unique_violation then rejected := true; end;
 assert rejected, 'same image accepted under another grant';
 assert (select consumed_at is null from public.palm_capture_sessions where id=c2), 'replay failure partially consumed grant';
 update public.palm_capture_sessions set expires_at=clock_timestamp()-interval '1 second' where id=c2;
 rejected := false;
 begin perform public.consume_palm_capture(c2,t,scope,'payment',repeat('a',64),repeat('e',64));
 exception when sqlstate 'PC001' then rejected := true; end;
 assert rejected, 'expired grant accepted';

 insert into public.enrol_sessions(terminal_id,user_id,status,expires_at)
 values(t,u,'claimed',clock_timestamp()+interval '60 seconds') returning id into s;
 perform public.complete_h5_palm_enrolment(s,t,u,'synthetic-palm-id');
 assert (select palm_enrolled from public.profiles where id=u), 'profile flag missing';
 assert (select status='completed' from public.enrol_sessions where id=s), 'session incomplete';
 assert (select count(*)=1 from public.palm_bindings where user_id=u and revoked_at is null), 'binding missing';
 insert into public.enrol_sessions(terminal_id,user_id,status,expires_at)
 values(t,u,'claimed',clock_timestamp()+interval '60 seconds') returning id into s2;
 rejected := false;
 begin perform public.complete_h5_palm_enrolment(s2,t,u,'second-palm');
 exception when sqlstate 'PC002' then rejected := true; end;
 assert rejected, 'second active binding accepted';
 assert (select status='claimed' from public.enrol_sessions where id=s2), 'failed enrolment partially completed';
end;
$$;
