-- Auto-renewal control, pending-cancellation flag (cancel stops future billing immediately but
-- keeps access until the paid period actually ends), and a guard against duplicate renewal
-- reminder emails across daily cron runs. `current_period_end` already exists and becomes the
-- single source of truth for "when does the current paid period end" — set on first successful
-- charge, advanced by one more period on every successful renewal charge.
alter table public.photographers
  add column auto_renew boolean not null default true,
  add column cancel_at_period_end boolean not null default false,
  add column renewal_reminder_sent_at timestamptz;
