-- Optional event start/end time — lets the calendar sync create a timed event instead of an
-- all-day one, and lets the double-booking check compare actual time ranges instead of just
-- flagging every event on the same date.
alter table public.events
  add column event_start_time time,
  add column event_end_time time;
