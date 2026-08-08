-- Tracks whether the client-facing "your gallery is about to expire" reminder email has already
-- gone out, so the daily lifecycle cron doesn't send it again on every run while a gallery sits in
-- its final week before expiry.
alter table public.galleries add column reminder_sent_at timestamptz;
