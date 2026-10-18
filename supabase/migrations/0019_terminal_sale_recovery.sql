-- Repair installations where 0011 was skipped but direct card payments were installed.
-- Idempotent; preserves existing sales, card charges and the retired wallet rail.
begin;
-- Require the direct card schema before installing its transition guard.
do $$ begin
 if to_regclass('public.card_payment_attempts') is null then
  raise exception 'Apply 0017_verified_cards.sql and 0018_card_payments.sql first';
 end if;
end $$;
-- Stable sale references prevent duplicate creation after response loss.
alter table public.transactions add column if not exists sale_id uuid;
create unique index if not exists transactions_terminal_sale_unique
  on public.transactions (terminal_id, sale_id) where sale_id is not null;

create or replace function public.create_terminal_transaction(
  p_terminal_id uuid, p_sale_id uuid, p_amount bigint, p_description text default null
) returns public.transactions
language plpgsql security definer set search_path = public
as $$
declare v_txn public.transactions; v_merchant uuid;
begin
  if p_sale_id is null or p_amount is null or p_amount <= 0 or p_amount > 100000000 then
    raise exception 'invalid sale details' using errcode = 'invalid_parameter_value';
  end if;
  select merchant_id into v_merchant from public.terminals where id = p_terminal_id;
  if not found then raise exception 'terminal not found' using errcode = 'PB001'; end if;
  insert into public.transactions (terminal_id, merchant_id, sale_id, amount_minor, description)
  values (p_terminal_id, v_merchant, p_sale_id, p_amount, p_description)
  on conflict (terminal_id, sale_id) where sale_id is not null do nothing;
  select * into v_txn from public.transactions
    where terminal_id = p_terminal_id and sale_id = p_sale_id;
  if v_txn.amount_minor <> p_amount or v_txn.description is distinct from p_description then
    raise exception 'sale reference reused with different details' using errcode = 'PB007';
  end if;
  return v_txn;
end;
$$;
revoke execute on function public.create_terminal_transaction(uuid, uuid, bigint, text) from public, anon, authenticated;
grant execute on function public.create_terminal_transaction(uuid, uuid, bigint, text) to service_role;


create or replace function public.guard_payment_transition() returns trigger
language plpgsql set search_path=public as $$
begin
 if row(new.amount_minor,new.terminal_id,new.merchant_id,new.sale_id) is distinct from row(old.amount_minor,old.terminal_id,old.merchant_id,old.sale_id) then
  raise exception 'payment details are immutable' using errcode='PB002';
 end if;
 if old.status<>'pending' and row(new.matched_user_id,new.match_score,new.match_mode,new.authenticated_at,new.payment_card_id) is distinct from row(old.matched_user_id,old.match_score,old.match_mode,old.authenticated_at,old.payment_card_id) then
  raise exception 'payer authorization is immutable' using errcode='PB002';
 end if;
 if new.status<>old.status and not (
  (old.status='pending' and new.status in ('authenticated','failed','cancelled')) or
  (old.status='authenticated' and new.status in ('processing','settled','failed','cancelled')) or
  (old.status='processing' and new.status in ('settled','failed'))
 ) then raise exception 'invalid payment transition' using errcode='PB002'; end if;
 if old.status='pending' and new.status='authenticated' then
  if new.matched_user_id is null or new.match_score is null or new.match_score<0 or new.match_score>100 or new.match_mode is null then
   raise exception 'missing payer authorization' using errcode='PB005';
  end if;
  new.authenticated_at:=clock_timestamp();
 end if;
 if old.status in ('settled','failed','cancelled') and row(new.settled_at,new.failure_reason) is distinct from row(old.settled_at,old.failure_reason) then
  raise exception 'final payment outcome is immutable' using errcode='PB002';
 end if;
 return new;
end $$;


drop trigger if exists payment_transition_guard on public.transactions;
create trigger payment_transition_guard before update on public.transactions
for each row execute function public.guard_payment_transition();
revoke execute on function public.guard_payment_transition() from public, anon, authenticated;
notify pgrst, 'reload schema';
commit;
