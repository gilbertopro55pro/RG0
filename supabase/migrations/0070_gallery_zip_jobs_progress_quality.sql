-- Parts are now sized by total source bytes (up to ~16GB) rather than a flat photo count, so a
-- single part can run long enough that "pending/processing/ready" alone isn't enough feedback —
-- processed_count/total_count let the client show a real 0-100% progress bar while one part is
-- still working through hundreds or thousands of photos.
alter table public.gallery_zip_jobs add column processed_count int not null default 0;
alter table public.gallery_zip_jobs add column total_count int not null default 0;

-- "web" resizes+recompresses each photo to roughly cap it around 3MB before adding it to the
-- archive (see resizeForWebQuality in src/lib/zipJobs.ts) — for a client who just wants to browse
-- or share the photos rather than print them, this keeps a large gallery's download to a
-- realistic size instead of the full original resolution.
alter table public.gallery_zip_jobs add column quality text not null default 'full' check (quality in ('full', 'web'));
