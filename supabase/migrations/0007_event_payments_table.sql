-- Move payment data off the events row so team members (who can SELECT their assigned
-- events) can never read deposit/balance amounts, even via direct API calls — enforced
-- by RLS, not just hidden in the UI.
create table public.event_payments (
  event_id uuid primary key references public.events(id) on delete cascade,
  deposit_amount numeric(10, 2) not null default 0,
  balance_amount numeric(10, 2) not null default 0,
  deposit_paid boolean not null default false,
  balance_paid boolean not null default false,
  balance_due_date date
);

alter table public.event_payments enable row level security;

create policy "event_payments_owner_only"
  on public.event_payments for all
  using (public.is_event_owner(event_id))
  with check (public.is_event_owner(event_id));

insert into public.event_payments (event_id, deposit_amount, balance_amount, deposit_paid, balance_paid, balance_due_date)
select id, deposit_amount, balance_amount, deposit_paid, balance_paid, balance_due_date
from public.events;

alter table public.events
  drop column deposit_amount,
  drop column balance_amount,
  drop column deposit_paid,
  drop column balance_paid,
  drop column balance_due_date;
