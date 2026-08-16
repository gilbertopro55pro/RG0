-- Caches client-side face-detection results (see SignaturePad-style browser-only feature: face
-- detection runs entirely in the photographer's browser via @vladmandic/face-api, never on a
-- server) so re-opening "זיהוי פרצופים" doesn't require reprocessing every photo again. box_*
-- fields are fractions of the photo's width/height (0-1), independent of any particular rendered
-- size. descriptor is the 128-d face-recognition embedding used to cluster faces together.
create table public.gallery_photo_faces (
  id uuid primary key default gen_random_uuid(),
  gallery_id uuid not null references public.galleries(id) on delete cascade,
  photo_id uuid not null references public.gallery_photos(id) on delete cascade,
  cluster_id uuid not null,
  box_x real not null,
  box_y real not null,
  box_width real not null,
  box_height real not null,
  descriptor real[] not null,
  created_at timestamptz not null default now()
);

create index gallery_photo_faces_gallery_id_idx on public.gallery_photo_faces(gallery_id);
create index gallery_photo_faces_cluster_id_idx on public.gallery_photo_faces(cluster_id);

alter table public.gallery_photo_faces enable row level security;

create policy "gallery_photo_faces_all_own"
  on public.gallery_photo_faces for all
  using (gallery_id in (select id from public.galleries where photographer_id = auth.uid()))
  with check (gallery_id in (select id from public.galleries where photographer_id = auth.uid()));
