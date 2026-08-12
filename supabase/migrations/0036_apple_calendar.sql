-- Apple/iCloud Calendar sync via CalDAV, alongside the existing Google integration — a
-- photographer can have either, both, or neither connected; each connected provider gets synced
-- independently on event create/update/delete. Unlike Google (OAuth, single "primary" calendar
-- assumed), CalDAV auth is HTTP Basic with an app-specific password, and iCloud accounts can have
-- several calendars, so the photographer explicitly picks which one to sync into after discovery.
alter table public.photographers
  add column apple_calendar_connected boolean not null default false,
  add column apple_calendar_email text,
  add column apple_calendar_app_password text,
  add column apple_calendar_url text,
  add column apple_calendar_display_name text;

-- The CalDAV resource UID (also the .ics filename) for an event synced to Apple Calendar —
-- needed to PUT an update or DELETE the same resource later, same role google_calendar_event_id
-- plays for Google.
alter table public.events
  add column apple_calendar_event_uid text;
