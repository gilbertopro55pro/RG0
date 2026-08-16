-- A full-page background photo for a spread, independent of the positioned photo/text elements —
-- rendered behind everything else, with its own blur/opacity controls.
alter table public.gallery_album_spreads
  add column background_photo_id uuid references public.gallery_photos(id) on delete set null,
  add column background_blur numeric not null default 0,
  add column background_opacity numeric not null default 100;
