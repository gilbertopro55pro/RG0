-- Intake assistant: a morning event (bar mitzvah at the synagogue, up to 4 hours) and an evening
-- event (18:00-00:00) may share a date. Off by default: any event blocks the whole day.
alter table photographers add column if not exists intake_allow_split_day boolean not null default false;
