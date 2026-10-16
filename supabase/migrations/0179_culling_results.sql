-- Photo culling, round 1 (owner, 2026-10-16): what the culling engine measured in each photo of
-- the test gallery (app/admin/culling?tab=bench). The engine runs in the owner's browser (nothing
-- of the photo leaves the device) and saves only the numbers: faces, how closed each eye is, and
-- the sharpness of the eyes and of the scene (lib/culling/verdict.ts, CullFeatures). The decision
-- (out of focus / eyes closed) is computed from these each time, so thresholds are tuned against
-- culling_labels (migration 0178) without measuring again. One row per photo; a new engine version
-- overwrites it.

create table if not exists public.culling_results (
  photo_id uuid primary key references public.gallery_photos(id) on delete cascade,
  photographer_id uuid not null references public.photographers(id) on delete cascade,
  gallery_id uuid not null references public.galleries(id) on delete cascade,
  engine_version text not null,
  features jsonb,
  error text,
  updated_at timestamptz not null default now()
);

create index if not exists culling_results_gallery_idx on public.culling_results (gallery_id);

alter table public.culling_results enable row level security;

-- The writer's own rows, and only for a photo in their own gallery (the parent check every
-- writable policy carries, see migration 0163).
create policy "culling_results_own" on public.culling_results for all
  using ((select auth.uid()) = photographer_id)
  with check (
    (select auth.uid()) = photographer_id
    and photo_id in (
      select id from public.gallery_photos
      where photographer_id = (select auth.uid()) and gallery_id = culling_results.gallery_id
    )
  );
