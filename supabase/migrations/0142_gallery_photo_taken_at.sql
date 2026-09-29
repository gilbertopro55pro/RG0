-- Auto album design (admin, 2026-09-29): the event stages are laid out in shooting order, read
-- from each original's EXIF DateTimeOriginal. taken_at_checked_at marks a photo as already read
-- (with or without a date), so a photo without EXIF isn't downloaded again on every run.
alter table public.gallery_photos
  add column if not exists taken_at timestamptz,
  add column if not exists taken_at_checked_at timestamptz;
