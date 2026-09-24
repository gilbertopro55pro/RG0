-- PayPlus webhook bookkeeping (2026-09-24): every callback row now records WHICH transaction it
-- was (for dedupe — PayPlus retries a callback it didn't get a 2xx for, and a retry must never
-- issue a second receipt), what the handler decided, and what happened with the Finbot receipt
-- (before this, a receipt failure only existed in Vercel's short-lived logs, so there was no way
-- to tell afterwards whether a paying customer ever got one).
alter table payplus_webhook_events
  add column if not exists transaction_uid text,
  add column if not exists photographer_id text,
  add column if not exists outcome text,
  add column if not exists receipt_status text,
  add column if not exists receipt_link text,
  add column if not exists receipt_error text;

update payplus_webhook_events
set transaction_uid = coalesce(payload->'transaction'->>'uid', payload->>'transaction_uid'),
    photographer_id = coalesce(payload->'transaction'->>'more_info', payload->>'more_info')
where transaction_uid is null;

create unique index if not exists payplus_webhook_events_transaction_uid_key
  on payplus_webhook_events (transaction_uid)
  where transaction_uid is not null;

-- Historic successful callbacks count as charges for the double-charge check going forward.
update payplus_webhook_events
set outcome = 'charged'
where outcome is null
  and coalesce(payload->'transaction'->>'status_code', payload->>'status_code') = '000';
