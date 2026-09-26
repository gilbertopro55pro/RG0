-- Intake assistant: the photographer doesn't work on Shabbat. Friday is open only for a morning event
-- (08:00-16:00), Friday evening and all of Saturday are unavailable (owner's rule, 2026-09-26).
alter table photographers add column if not exists intake_shabbat_closed boolean not null default false;
