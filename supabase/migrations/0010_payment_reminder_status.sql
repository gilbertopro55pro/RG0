-- Payment reminders need an extra lifecycle step: when the reminder date arrives, the
-- photographer is asked to confirm the balance is actually still unpaid before anything
-- is sent to the client (avoids reminding someone who already paid but wasn't marked as such).
alter table public.scheduled_messages drop constraint scheduled_messages_status_check;
alter table public.scheduled_messages add constraint scheduled_messages_status_check
  check (status in ('pending', 'awaiting_confirmation', 'sent', 'canceled', 'failed'));
