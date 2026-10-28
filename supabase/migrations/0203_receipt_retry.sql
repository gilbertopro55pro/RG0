-- A subscription receipt Finbot couldn't take (2026-10-28: "fetch failed" on a renewal) is retried
-- hourly by /api/cron/retry-receipts with the same plan and amount, for 24 hours.
-- receipt_status gains two values: 'retry' (waiting for the cron) and 'retrying' (a cron run sent it).
alter table public.payplus_webhook_events
  add column if not exists receipt_plan text,
  add column if not exists receipt_amount numeric,
  add column if not exists receipt_attempts integer not null default 0,
  add column if not exists receipt_retry_started_at timestamptz;

create index if not exists payplus_webhook_events_receipt_retry_idx
  on public.payplus_webhook_events (receipt_status)
  where receipt_status in ('retry', 'retrying');
