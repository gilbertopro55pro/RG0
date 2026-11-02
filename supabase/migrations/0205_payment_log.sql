-- Every payment received on a leg, with the day it came in (owner, 2026-11-02, "תיקון").
--
-- Until now a leg kept one date, `{leg}_paid_at`, and the revenue views put everything received on
-- the leg in that date's month. A partial payment counted in its month, but completing it later
-- moved the whole amount, the earlier part too, to the month of the completion. The owner: the
-- partial payment stays in its month, and the rest counts in the month it came in.
--
-- `{leg}_payments` is the list of what came in: [{"amount": 3500, "at": "<timestamptz>"}, ...]. A
-- trigger keeps it, from the totals every writer already sets (`{leg}_paid` and
-- `{leg}_paid_amount`), so the event page, the quick actions, a receipt and the payment reminder all
-- keep it right without knowing about it. The revenue views read it (lib/paymentLog.ts).

alter table public.event_payments
  add column if not exists deposit_payments jsonb not null default '[]'::jsonb,
  add column if not exists balance_payments jsonb not null default '[]'::jsonb;

-- What was received so far, on the date it was recorded: the same month it counted in until now.
update public.event_payments set
  deposit_payments = case
    when deposit_paid_at is not null and (case when deposit_paid then coalesce(deposit_amount, 0) else coalesce(deposit_paid_amount, 0) end) > 0
      then jsonb_build_array(jsonb_build_object(
        'amount', case when deposit_paid then coalesce(deposit_amount, 0) else coalesce(deposit_paid_amount, 0) end,
        'at', deposit_paid_at))
    else '[]'::jsonb end,
  balance_payments = case
    when balance_paid_at is not null and (case when balance_paid then coalesce(balance_amount, 0) else coalesce(balance_paid_amount, 0) end) > 0
      then jsonb_build_array(jsonb_build_object(
        'amount', case when balance_paid then coalesce(balance_amount, 0) else coalesce(balance_paid_amount, 0) end,
        'at', balance_paid_at))
    else '[]'::jsonb end;

-- The list after the leg's received total changed. More received: the difference is a new payment,
-- on the leg's paid date (set to now by whoever marks a payment). Less received (a typo fixed, a
-- completion undone, reset to unpaid): the earliest payments are kept up to the new total.
create or replace function public.payment_log_next(log jsonb, old_received numeric, old_at timestamptz, new_received numeric, new_at timestamptz)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  result jsonb := coalesce(log, '[]'::jsonb);
  total numeric := 0;
  kept jsonb := '[]'::jsonb;
  e jsonb;
  part numeric;
begin
  if coalesce(new_received, 0) <= 0 then
    return '[]'::jsonb;
  end if;
  select coalesce(sum((x->>'amount')::numeric), 0) into total from jsonb_array_elements(result) x;
  -- A row from before the list: what it had received, on the date it was recorded.
  if total = 0 and coalesce(old_received, 0) > 0 and old_at is not null then
    result := jsonb_build_array(jsonb_build_object('amount', old_received, 'at', old_at));
    total := old_received;
  end if;
  if new_received > total then
    return result || jsonb_build_array(jsonb_build_object('amount', round(new_received - total, 2), 'at', new_at));
  end if;
  if new_received = total then
    return result;
  end if;
  total := 0;
  for e in select x from jsonb_array_elements(result) x loop
    exit when total >= new_received;
    part := least((e->>'amount')::numeric, new_received - total);
    kept := kept || jsonb_build_array(jsonb_set(e, '{amount}', to_jsonb(part)));
    total := total + part;
  end loop;
  return kept;
end;
$$;

-- The list is the trigger's alone: what a client writes to it is ignored.
create or replace function public.event_payments_track_received()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  old_dep numeric := 0;
  old_bal numeric := 0;
  old_dep_log jsonb := '[]'::jsonb;
  old_bal_log jsonb := '[]'::jsonb;
  old_dep_at timestamptz;
  old_bal_at timestamptz;
begin
  if tg_op = 'UPDATE' then
    old_dep := case when old.deposit_paid then coalesce(old.deposit_amount, 0) else coalesce(old.deposit_paid_amount, 0) end;
    old_bal := case when old.balance_paid then coalesce(old.balance_amount, 0) else coalesce(old.balance_paid_amount, 0) end;
    old_dep_log := old.deposit_payments;
    old_bal_log := old.balance_payments;
    old_dep_at := old.deposit_paid_at;
    old_bal_at := old.balance_paid_at;
  end if;
  new.deposit_payments := public.payment_log_next(
    old_dep_log, old_dep, old_dep_at,
    case when new.deposit_paid then coalesce(new.deposit_amount, 0) else coalesce(new.deposit_paid_amount, 0) end,
    coalesce(new.deposit_paid_at, now()));
  new.balance_payments := public.payment_log_next(
    old_bal_log, old_bal, old_bal_at,
    case when new.balance_paid then coalesce(new.balance_amount, 0) else coalesce(new.balance_paid_amount, 0) end,
    coalesce(new.balance_paid_at, now()));
  return new;
end;
$$;

create or replace trigger event_payments_track_received
  before insert or update on public.event_payments
  for each row execute function public.event_payments_track_received();
