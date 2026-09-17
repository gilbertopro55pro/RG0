-- Lets a photographer record a payment as partially received instead of only the existing binary
-- paid/not-paid toggle. deposit_paid/balance_paid keep their existing meaning ("fully paid" — still
-- what the client portal and analytics revenue calc read); *_paid_amount is set only for a partial
-- payment, and the remaining balance is always computed live in the UI (amount - paid_amount)
-- rather than stored, so it never goes stale if the declared amount itself is edited later.
-- *_notes is a private, photographer-only free-text note (never shown on the client portal) for
-- what the remaining balance on that leg covers.
alter table public.event_payments
  add column deposit_paid_amount numeric(10, 2),
  add column deposit_notes text,
  add column balance_paid_amount numeric(10, 2),
  add column balance_notes text;
