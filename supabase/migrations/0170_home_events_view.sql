-- The home screen's events view (owner, 2026-10-13): {"status": "week" | "upcoming" | "completed" |
-- "all" | "duplicates", "sort": "asc" | "desc" | "month" | "date" | "range"}. Saved on the account,
-- so it stays the same after logging out and on every device. Null = the default ("week": events of
-- the coming week). The photographer's own setting, not a billing field, so not in the guard.
alter table photographers add column if not exists home_events_view jsonb;
