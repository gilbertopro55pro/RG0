-- Swap the unused Stripe-shaped columns (never wired to any provider) for PayPlus equivalents.
-- subscription_status/current_period_end stay as-is — generic enough for either provider.
alter table public.photographers
  drop column stripe_customer_id,
  drop column stripe_subscription_id,
  add column payplus_customer_uid text,
  add column payplus_recurring_uid text;
