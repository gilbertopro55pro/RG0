-- v1 "video delivery" (not full adaptive streaming — see the DIY-vs-Mux/Cloudflare-Stream/Bunny
-- research done for this feature): the finished video file sits in the same R2 bucket photos
-- already use, served via a signed GET URL and played back with a plain <video> tag using HTTP
-- range requests (R2's S3-compatible API already supports these, so seeking works fine). A
-- separate table rather than folding into gallery_photos — videos don't go through culling,
-- portfolio tagging, or preview-image generation, so reusing that table would mean either a
-- media_type discriminator checked everywhere those features run, or nullable columns that only
-- make sense for one media type. Kept deliberately minimal for a first, unproven version of this
-- feature — expand later if usage shows it's worth it.
create table public.gallery_videos (
  id uuid primary key default gen_random_uuid(),
  gallery_id uuid not null references public.galleries(id) on delete cascade,
  photographer_id uuid not null references public.photographers(id) on delete cascade,
  storage_path text not null,
  original_filename text not null,
  file_size_bytes bigint not null default 0,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create index gallery_videos_gallery_id_idx on public.gallery_videos (gallery_id);

alter table public.gallery_videos enable row level security;

create policy "gallery_videos_all_own"
  on public.gallery_videos for all
  using (auth.uid() = photographer_id)
  with check (auth.uid() = photographer_id);
