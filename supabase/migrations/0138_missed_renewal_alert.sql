-- A PayPlus recurring charge that fails (e.g. declined by the card issuer) sends no callback, so the
-- app never hears of it (found 2026-09-28: a Max decline visible only in PayPlus's failed report).
-- The subscription-lifecycle cron now emails the admin when an active recurring account's paid
-- period ended a couple of days ago with no charge moving it forward. This holds the period end it
-- already alerted for, so each missed renewal is reported once, not every day.
alter table photographers add column if not exists missed_renewal_alerted_for timestamptz;
