-- Photo culling, round 0 (owner, 2026-10-16): the admin labels photos of a test gallery ("מודל
-- סינון", one folder per event) by hand — fine / out of focus / eyes closed / both — and the
-- culling engine is later measured against these labels (/admin/culling). One label per photo.
create table if not exists public.culling_labels (
  photo_id uuid primary key references public.gallery_photos(id) on delete cascade,
  photographer_id uuid not null references public.photographers(id) on delete cascade,
  gallery_id uuid not null references public.galleries(id) on delete cascade,
  label text not null check (label in ('ok', 'blurry', 'eyes_closed', 'both', 'skip')),
  updated_at timestamptz not null default now()
);

create index if not exists culling_labels_gallery_idx on public.culling_labels (gallery_id);

alter table public.culling_labels enable row level security;

-- The photographer's own labels, on their own photos in that same gallery (the parent check of
-- migration 0163's rule).
create policy "culling_labels_own"
  on public.culling_labels for all
  using ((select auth.uid()) = photographer_id)
  with check (
    (select auth.uid()) = photographer_id
    and photo_id in (
      select id from public.gallery_photos
      where photographer_id = (select auth.uid()) and gallery_id = culling_labels.gallery_id
    )
  );
