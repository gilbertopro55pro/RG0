-- Extra assistant conversations bought in packs (owner, 2026-10-01), paid separately from the
-- subscription (a one-time PayPlus charge + a Finbot receipt). Bought conversations don't expire:
-- they're used only after the plan's monthly cap is reached.

alter table photographers
  add column if not exists intake_extra_conversations integer not null default 0 check (intake_extra_conversations >= 0),
  -- 'YYYY-MM' (Israel) of the last "90% of the monthly cap" phone notification, so it goes out once a month.
  add column if not exists intake_cap_alerted_month text;

-- A conversation that used a bought credit (it doesn't count toward the monthly cap).
alter table bot_conversations
  add column if not exists extra_credit boolean not null default false;

create table if not exists intake_credit_purchases (
  id uuid primary key default gen_random_uuid(),
  photographer_id uuid not null references photographers(id) on delete cascade,
  conversations integer not null check (conversations > 0),
  amount numeric(10,2) not null check (amount > 0),
  status text not null default 'pending' check (status in ('pending', 'paid', 'failed')),
  transaction_uid text,
  charged_amount numeric(10,2),
  receipt_status text,
  receipt_link text,
  receipt_error text,
  created_at timestamptz not null default now(),
  paid_at timestamptz
);
create index if not exists intake_credit_purchases_photographer_idx on intake_credit_purchases (photographer_id, created_at desc);

alter table intake_credit_purchases enable row level security;
drop policy if exists "photographer reads own credit purchases" on intake_credit_purchases;
create policy "photographer reads own credit purchases" on intake_credit_purchases
  for select using (photographer_id = auth.uid());
-- Inserts and updates go through the server (service role) only.

-- Marks a purchase paid and adds its conversations, once (the webhook may be retried).
create or replace function credit_intake_purchase(p_purchase uuid, p_transaction text, p_charged numeric)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_photographer uuid;
  v_conversations integer;
begin
  update intake_credit_purchases
     set status = 'paid', paid_at = now(), transaction_uid = p_transaction, charged_amount = p_charged
   where id = p_purchase and status <> 'paid'
   returning photographer_id, conversations into v_photographer, v_conversations;
  if v_photographer is null then
    return null;
  end if;
  update photographers
     set intake_extra_conversations = intake_extra_conversations + v_conversations
   where id = v_photographer;
  return v_conversations;
end;
$$;

-- Takes one bought conversation if there is one left. True = taken.
create or replace function consume_intake_extra(p_photographer uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_left integer;
begin
  update photographers
     set intake_extra_conversations = intake_extra_conversations - 1
   where id = p_photographer and intake_extra_conversations > 0
   returning intake_extra_conversations into v_left;
  return v_left is not null;
end;
$$;

revoke all on function credit_intake_purchase(uuid, text, numeric) from public, anon, authenticated;
revoke all on function consume_intake_extra(uuid) from public, anon, authenticated;
