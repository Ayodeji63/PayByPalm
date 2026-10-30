-- Live metadata feed and safe same-session retakes after definitive capture rejection.
begin;
set local lock_timeout='10s';
set local statement_timeout='60s';
create table public.operation_events(
 id bigint generated always as identity primary key,
 operation_id uuid not null, request_id uuid not null,
 terminal_id uuid, merchant_id uuid, user_id uuid, scope_id uuid,
 operation text not null check(operation in ('terminal','enrollment','verification','identification','payment','capture')),
 stage text not null check(stage ~ '^[a-z_]{1,64}$'),
 state text not null check(state in ('started','succeeded','rejected','failed','observed')),
 occurred_at timestamptz not null default clock_timestamp(),
 details jsonb not null default '{}'::jsonb check(jsonb_typeof(details)='object' and octet_length(details::text)<=8192)
);
create index operation_events_trace on public.operation_events(request_id,id);
create index operation_events_terminal on public.operation_events(terminal_id,id desc);
alter table public.operation_events enable row level security;
revoke all on public.operation_events from public,anon,authenticated;
grant select on public.operation_events to service_role;
revoke insert,update,delete on public.operation_events from service_role;

-- Sequence allocation and commit order are serialized so a cursor never skips
-- a late-committing event. Batches are small and contain no images or credentials.
create function public.append_operation_events(p_events jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare item jsonb; last_id bigint;
begin
 if jsonb_typeof(p_events)<>'array' or jsonb_array_length(p_events)>50 or octet_length(p_events::text)>262144 then
  raise exception 'invalid operation batch'; end if;
 perform pg_advisory_xact_lock(hashtextextended('paybypalm-operation-feed',0));
 for item in select value from jsonb_array_elements(p_events) loop
  insert into public.operation_events(operation_id,request_id,terminal_id,merchant_id,user_id,scope_id,operation,stage,state,occurred_at,details)
  values((item->>'operation_id')::uuid,(item->>'request_id')::uuid,(item->>'terminal_id')::uuid,(item->>'merchant_id')::uuid,
   (item->>'user_id')::uuid,(item->>'scope_id')::uuid,item->>'operation',item->>'stage',item->>'state',(item->>'occurred_at')::timestamptz,
   coalesce((select jsonb_object_agg(key,value) from jsonb_each(item->'details')
    where key in ('upstreamRequestId','provider','palmSide','decision','guidance','scope','result','errorCode','timings','providerMatched','score','cosineSimilarity','minimumPairSimilarity','sampleCount','frameCount','candidateCount','amountMinor','durationMs')),'{}'::jsonb))
  returning id into last_id;
 end loop;
 if last_id>50000 then delete from public.operation_events where id<=last_id-50000; end if;
end $$;

-- Call ONLY after CCNet has explicitly rejected input (400/413/415/422), before
-- writing a template. Timeouts/unknown outcomes must retain their fingerprint.
create function public.reset_rejected_ccnet_capture(p_session uuid,p_owner uuid,p_fingerprint text)
returns boolean language plpgsql security definer set search_path='' as $$
begin
 update public.enrol_sessions set capture_fingerprint=null,palm_side=null,registration_owner=null,registration_until=null
 where id=p_session and provider='ccnet' and status='claimed' and registration_owner=p_owner
   and capture_fingerprint=p_fingerprint and expires_at>clock_timestamp();
 return found;
end $$;
revoke all on function public.append_operation_events(jsonb),public.reset_rejected_ccnet_capture(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.append_operation_events(jsonb),public.reset_rejected_ccnet_capture(uuid,uuid,text) to service_role;
notify pgrst,'reload schema';
commit;
