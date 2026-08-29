-- A requested monthly<->annual plan switch doesn't take effect immediately (PayPlus recurring
-- charges are fixed amount/cadence, so switching means canceling the old one and setting up a
-- new one — see the subscription-lifecycle cron) — it's scheduled for whenever it's actually fair
-- to start billing the new plan: at the next renewal for monthly->annual, or once the prepaid
-- annual value (10 of the 12 months) is used up for annual->monthly.
alter table public.photographers add column pending_plan text check (pending_plan in ('monthly', 'annual'));
alter table public.photographers add column pending_plan_effective_at timestamptz;
