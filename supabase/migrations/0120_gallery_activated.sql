-- Every event used to auto-provision a gallery unconditionally the moment it was created (see
-- createEvent.ts — that auto-insert has since been removed), so it showed up as an unpublished
-- draft on the photographer's own galleries page even when they never asked for one. `activated`
-- gates that: false means "not a real gallery yet as far as the photographer's own list is
-- concerned" — it stays linked to its event and reappears the moment the photographer explicitly
-- sets it up via the event card's own gallery flow, which flips this back to true.
alter table public.galleries add column if not exists activated boolean not null default true;

-- Backfill: precisely targets rows created by the removed auto-insert and nothing else.
-- title_customized = false is the safe fingerprint here — it's the one value ONLY that removed
-- code path ever wrote explicitly; every other gallery-creation path (a fresh "גלריה חדשה", a
-- "קישור לגלריה קיימת" link, or a title later saved in gallery settings) sets or defaults it to
-- true, so this can't catch a gallery a photographer already genuinely created or touched.
update public.galleries
set activated = false
where event_id is not null and published = false and title_customized = false;
