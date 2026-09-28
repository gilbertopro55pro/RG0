-- Print-house download tracking. The print-house email links to /print/<share_token> on our own
-- site, not straight to the file, so we can record when the print house downloads the files and
-- let the photographer renew an expired link without re-rendering the album.
alter table gallery_album_export_jobs
  add column if not exists share_token text unique,
  -- When the link stops working for the print house. expires_at is still when the file itself is
  -- deleted (kept longer for print jobs, so the link can be renewed without re-rendering).
  add column if not exists link_expires_at timestamptz,
  add column if not exists download_count integer not null default 0,
  add column if not exists first_downloaded_at timestamptz,
  add column if not exists last_downloaded_at timestamptz;

-- Atomic "count this download"; returns the new count (1 = first download).
create or replace function record_print_house_download(p_job uuid)
returns integer
language sql
as $$
  update gallery_album_export_jobs
     set download_count = download_count + 1,
         first_downloaded_at = coalesce(first_downloaded_at, now()),
         last_downloaded_at = now()
   where id = p_job
  returning download_count;
$$;

revoke execute on function record_print_house_download(uuid) from public, anon, authenticated;
