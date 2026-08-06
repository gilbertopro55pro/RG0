alter table public.gallery_photos
  add column is_favorite boolean not null default false;

alter table public.galleries
  add column selection_confirmed_at timestamptz;
