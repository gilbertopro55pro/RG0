-- Intake assistant: the photographer's own hours for each part of the day (owner, 2026-10-19), used
-- by the date check when a morning, an afternoon and an evening event may share a date
-- (intake_allow_split_day). {"morning":{"start":"07:30","end":"15:00"},"afternoon":{...},
-- "evening":{...}}. Null, or a missing or invalid part, = the defaults in lib/daySlots.ts (morning
-- 07:30-15:00, afternoon 12:00-16:00, evening 18:00-00:00).
alter table photographers add column if not exists intake_day_slots jsonb
  check (intake_day_slots is null or jsonb_typeof(intake_day_slots) = 'object');
