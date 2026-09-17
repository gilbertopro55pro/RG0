-- Real background export progress for album JPG/PSD/PDF exports — mirrors gallery_zip_jobs
-- (0067_gallery_zip_jobs.sql) exactly: the export route creates one job row and returns
-- immediately, a fire-and-forget internal request does the actual (page-by-page) rendering,
-- updating processed_count as it goes, and the client polls this table for real progress instead
-- of a client-side timer with no idea how far the real work actually is.
create table public.gallery_album_export_jobs (
  id uuid primary key default gen_random_uuid(),
  album_id uuid not null references public.gallery_albums(id) on delete cascade,
  gallery_id uuid not null references public.galleries(id) on delete cascade,
  photographer_id uuid not null references public.photographers(id) on delete cascade,
  format text not null check (format in ('jpg', 'psd', 'pdf')),
  from_page int not null,
  to_page int not null,
  -- PDF only ('high' | 'web'); null for jpg/psd.
  quality text,
  status text not null default 'pending' check (status in ('pending', 'processing', 'ready', 'failed')),
  processed_count int not null default 0,
  total_count int not null default 0,
  storage_path text,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '48 hours')
);

create index gallery_album_export_jobs_gallery_id_idx on public.gallery_album_export_jobs(gallery_id);
create index gallery_album_export_jobs_status_idx on public.gallery_album_export_jobs(status);

alter table public.gallery_album_export_jobs enable row level security;

create policy "gallery_album_export_jobs_owner_only"
  on public.gallery_album_export_jobs for all
  using (auth.uid() = photographer_id)
  with check (auth.uid() = photographer_id);
