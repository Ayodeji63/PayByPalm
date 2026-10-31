-- Align the checkout score floor with the requested 0.50 reader threshold.
-- Preserve exact binding, validity, card, idempotency and reconciliation guards.
begin;
set local lock_timeout='10s';
set local statement_timeout='60s';
create or replace function public.guard_ccnet_authorization() returns trigger language plpgsql set search_path='' as $$
begin
 if old.status<>'pending' and row(new.palm_provider,new.palm_binding_id) is distinct from row(old.palm_provider,old.palm_binding_id) then
  raise exception 'palm authorization is immutable' using errcode='PB002'; end if;
 if old.status='pending' and new.status='authenticated' and new.palm_provider='ccnet' then
  perform 1 from public.profiles where id=new.matched_user_id for share;
  perform 1 from public.palm_bindings where id=new.palm_binding_id and user_id=new.matched_user_id and provider='ccnet' and revoked_at is null for share;
  if not found or new.match_score is null or new.match_score<50 then raise exception 'active CCNet binding required' using errcode='PB005'; end if;
 end if;
 return new;
end $$;

-- The preserved core rail also has a legacy 70-point lower bound. Change only
-- that bound, retaining its current verified-card, mode, expiry and claim checks.
do $threshold$
declare definition text;
begin
 definition:=pg_get_functiondef('public.begin_card_payment_previous(uuid,uuid,text,integer,integer)'::regprocedure);
 if strpos(definition,'p_accept_score<70')>0 then
  execute replace(definition,'p_accept_score<70','p_accept_score<50');
 elsif strpos(definition,'p_accept_score<50')=0 then
  raise exception 'unexpected card charge score guard; review before lowering threshold';
 end if;
end $threshold$;
revoke all on function public.begin_card_payment_previous(uuid,uuid,text,integer,integer) from public,anon,authenticated,service_role;

create or replace function public.begin_card_payment(p_transaction uuid,p_terminal uuid,p_domain text,p_validity integer,p_accept_score integer)
returns setof public.card_payment_attempts language plpgsql security definer set search_path='' as $$
declare t public.transactions;
begin
 select * into t from public.transactions where id=p_transaction and terminal_id=p_terminal for update;
 if not found then raise exception 'payment not found' using errcode='PB001'; end if;
 if exists(select 1 from public.card_payment_attempts where transaction_id=t.id) then return; end if;
 if t.palm_provider is distinct from 'ccnet' or t.match_score is null or t.match_score<50 then
  raise exception 'fresh CCNet authentication required' using errcode='PB005'; end if;
 perform 1 from public.profiles where id=t.matched_user_id for share;
 perform 1 from public.palm_bindings where id=t.palm_binding_id and user_id=t.matched_user_id and provider='ccnet' and revoked_at is null for share;
 if not found then raise exception 'palm binding revoked or replaced' using errcode='PB005'; end if;
 return query select * from public.begin_card_payment_previous(p_transaction,p_terminal,p_domain,p_validity,greatest(p_accept_score,50));
end $$;
revoke all on function public.guard_ccnet_authorization(),public.begin_card_payment(uuid,uuid,text,integer,integer) from public,anon,authenticated;
grant execute on function public.begin_card_payment(uuid,uuid,text,integer,integer) to service_role;
notify pgrst,'reload schema';
commit;
