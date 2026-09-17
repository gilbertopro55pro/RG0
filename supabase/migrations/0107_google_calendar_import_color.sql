-- A second, separate calendar color from google_calendar_color_id (which tags events the APP
-- created, so the calendar view can filter them back out from the photographer's own unrelated
-- events). This one means the opposite: "a raw booking I color-coded myself, not yet in the app" —
-- the calendar-scan-for-new-events feature looks for events in THIS color that have no matching
-- events.google_calendar_event_id yet, and offers to open a prefilled "new event" form for each.
alter table public.photographers add column if not exists google_calendar_import_color_id text;
