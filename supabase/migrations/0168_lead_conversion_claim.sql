-- The questionnaire turns an approved quote into an event once (audit 2026-10-13). Two submissions
-- at the same moment (a double tap, two tabs) both saw no event yet and both created one. The run
-- that sets conversion_claimed_at first creates the event; a claim older than 2 minutes counts as
-- abandoned (its run failed), so the client can try again.
alter table leads add column if not exists conversion_claimed_at timestamptz;
