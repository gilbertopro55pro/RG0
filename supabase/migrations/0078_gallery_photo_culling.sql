-- Internal keep/reject sort pass a photographer runs before a gallery ever reaches the
-- client — 'pending' photos are untouched, 'kept' is purely informational (no filtering
-- effect), 'rejected' is hidden from every client-facing query. Defaulting to 'pending'
-- means existing photos and every future upload behave exactly as before until the
-- photographer actively culls the gallery.
alter table public.gallery_photos
  add column culling_status text not null default 'pending'
    check (culling_status in ('pending', 'kept', 'rejected'));
