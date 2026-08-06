alter table public.photographers
  add column stripe_customer_id text,
  add column stripe_subscription_id text,
  add column subscription_status text not null default 'incomplete',
  add column current_period_end timestamptz;
