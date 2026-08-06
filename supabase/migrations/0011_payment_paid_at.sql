-- Needed for cash-basis revenue reporting (analytics dashboard) — until now we only
-- tracked whether a payment was made, not when, so revenue couldn't be bucketed by month.
alter table public.event_payments
  add column deposit_paid_at timestamptz,
  add column balance_paid_at timestamptz;
