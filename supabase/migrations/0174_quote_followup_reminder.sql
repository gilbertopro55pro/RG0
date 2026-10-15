-- "תזכורת" on the quote follow-up prompt (owner, 2026-10-15, like the new-lead popup's reminder,
-- migration 0171): the photographer picks 30 minutes, an hour or 3 hours, and the prompt hides until
-- remind_at, then shows again with a phone notification (once: remind_pushed_at), unless the lead
-- was handled by hand since remind_set_at (any activity on it, leads.last_activity_at).
alter table public.scheduled_messages
  add column if not exists remind_at timestamptz,
  add column if not exists remind_set_at timestamptz,
  add column if not exists remind_pushed_at timestamptz;

create index if not exists scheduled_messages_remind_at_idx
  on public.scheduled_messages (remind_at)
  where status = 'awaiting_confirmation' and remind_at is not null;
