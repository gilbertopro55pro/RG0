-- Set true only by the calendar-scan bulk-import flow (quick-add several events at once with no
-- per-event review form) — the events list highlights these differently until the photographer
-- opens one and saves an edit on it (see the events/[id] PATCH route, which always clears this
-- back to false on any saved edit, regardless of what fields changed).
alter table public.events add column if not exists needs_review boolean not null default false;
