do $$
declare actor uuid='aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa'; mid uuid='bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb'; tid uuid='cccccccc-cccc-4ccc-cccc-cccccccccccc'; m jsonb; t jsonb; count_before bigint;
begin
 if has_function_privilege('anon','public.admin_save_merchant(uuid,uuid,text,text,text,text,text,timestamptz)','execute') or has_function_privilege('authenticated','public.admin_save_terminal(uuid,uuid,uuid,text,text,text,timestamptz)','execute') then raise exception 'public RPC access'; end if;
 if has_table_privilege('authenticated','public.admin_sessions','select') or has_table_privilege('anon','public.admin_audit','insert') then raise exception 'public admin data access'; end if;
 m=public.admin_save_merchant(actor,mid,'Ayo Stores',null,null,null,null);
 perform public.admin_save_merchant(actor,mid,'Ayo Stores',null,null,null,null);
 if (select count(*) from public.accounts where kind='merchant')<>1 or (select count(*) from public.admin_audit)<>1 then raise exception 'merchant retry duplicated state'; end if;
 select count(*) into count_before from public.accounts;
 alter table public.merchants add constraint test_rollback check(name<>'Rollback');
 begin
  perform public.admin_save_merchant(actor,gen_random_uuid(),'Rollback',null,null,null,null);
  raise exception 'rollback test unexpectedly succeeded';
 exception when check_violation then null;end;
 if (select count(*) from public.accounts)<>count_before then raise exception 'orphaned account'; end if;
 t=public.admin_save_terminal(actor,tid,mid,'Counter 1',repeat('a',64),'create');
 perform public.admin_save_terminal(actor,tid,mid,'Counter 1',repeat('a',64),'create');
 if (select count(*) from public.terminals)<>1 or (select count(*) from public.admin_audit where action='terminal.created')<>1 then raise exception 'terminal retry duplicated state'; end if;
 if t ? 'api_key_hash' then raise exception 'RPC returned key hash'; end if;
 begin
  perform public.admin_save_terminal(actor,tid,gen_random_uuid(),'Moved',null,'label',(t->>'updated_at')::timestamptz);
  raise exception 'reassignment succeeded';
 exception when sqlstate 'PA400' then null;end;
 t=public.admin_save_terminal(actor,tid,null,null,repeat('b',64),'disable',(t->>'updated_at')::timestamptz);
 if (select count(*) from public.terminals where api_key_hash=repeat('a',64))<>0 or (select disabled_at from public.terminals where id=tid) is null then raise exception 'old device key still valid'; end if;
 t=public.admin_save_terminal(actor,tid,null,null,repeat('c',64),'rotate',(t->>'updated_at')::timestamptz);
 if (select disabled_at from public.terminals where id=tid) is not null or (select api_key_hash from public.terminals where id=tid)<>repeat('c',64) then raise exception 'rotation failed'; end if;
 begin
  perform public.admin_save_terminal(actor,tid,null,'Stale',null,'label','2000-01-01'::timestamptz);
  raise exception 'stale write succeeded';
 exception when sqlstate 'PA409' then null;end;
 if (select label from public.terminals where id=tid)<>'Counter 1' then raise exception 'failed update changed label';end if;
end $$;
