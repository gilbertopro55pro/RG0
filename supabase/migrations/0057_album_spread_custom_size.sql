-- Per-spread physical-size override, nullable — null means "use the album's own width_cm/
-- height_cm" (the overwhelming majority of pages). Exists specifically for a "cover" page created
-- at a custom size different from the rest of the album (e.g. a square cover on a landscape
-- album) — every other spread leaves both columns null and behaves exactly as before.
alter table public.gallery_album_spreads
  add column width_cm numeric,
  add column height_cm numeric;
