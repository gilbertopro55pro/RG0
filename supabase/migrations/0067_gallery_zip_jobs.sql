-- Background ZIP builder for large galleries (thousands of photos) — download-zip used to build
-- the archive synchronously inside one request, which is fine for a few hundred photos but can't
-- work at all for a gallery with thousands: too slow for one serverless invocation, and the
-- client would have to keep a connection open the whole time. Instead the requested photo ids are
-- split into fixed-size parts, each processed as its own short job (self-chained across
-- invocations — see src/lib/zipJobs.ts), and the client polls for parts to download as they
-- finish, same pattern larger gallery platforms use.
create table public.gallery_zip_jobs (
  id uuid primary key default gen_random_uuid(),
  gallery_id uuid not null references public.galleries(id) on delete cascade,
  -- Groups every part of one download request together so the client can poll a single id and
  -- see all parts' progress at once.
  batch_id uuid not null,
  part_index int not null,
  part_count int not null,
  photo_ids jsonb not null,
  status text not null default 'pending' check (status in ('pending', 'processing', 'ready', 'failed')),
  storage_path text,
  error_message text,
  created_at timestamptz not null default now(),
  -- Finished zips are cleaned up after this — no point keeping large archives in storage forever
  -- once nobody is realistically still coming back to download them.
  expires_at timestamptz not null default (now() + interval '48 hours')
);

create index gallery_zip_jobs_batch_id_idx on public.gallery_zip_jobs(batch_id);
create index gallery_zip_jobs_status_idx on public.gallery_zip_jobs(status);
create index gallery_zip_jobs_gallery_id_idx on public.gallery_zip_jobs(gallery_id);

alter table public.gallery_zip_jobs enable row level security;

-- Direct client access is scoped to the owning photographer only, matching every other
-- gallery-child table — the client-facing gallery reads/writes this exclusively through the
-- service-role API routes, same as gallery_photos itself.
create policy "gallery_zip_jobs_all_own"
  on public.gallery_zip_jobs for all
  using (gallery_id in (select id from public.galleries where photographer_id = auth.uid()))
  with check (gallery_id in (select id from public.galleries where photographer_id = auth.uid()));
