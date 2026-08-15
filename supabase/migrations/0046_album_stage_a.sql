-- Stage-A album proofing upgrades: a per-spread layout choice (rendering variant, doesn't change
-- how many photos a spread holds) and an optional dedicated cover photo for the album, shown as
-- its own page before spread 1 in the client-facing proofing view.
alter table public.gallery_album_spreads
  add column layout text not null default 'split' check (layout in ('split', 'feature', 'stack'));

alter table public.gallery_albums
  add column cover_photo_id uuid references public.gallery_photos(id) on delete set null;
