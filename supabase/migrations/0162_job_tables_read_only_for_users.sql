-- Security fix (audit 2026-10-13): the export job tables let a signed-in photographer insert or
-- update their own rows from the browser, storage_path and expires_at included. The every-minute
-- cleanup cron deletes whatever storage_path an expired row names, with the service role, so a
-- photographer could have it delete another studio's original photos (their keys appear in signed
-- URLs on any shared gallery). Every write already goes through server routes with the service
-- role, so users keep reading their rows and can no longer write them.
alter policy "gallery_zip_jobs_all_own" on public.gallery_zip_jobs with check (false);
alter policy "gallery_album_export_jobs_owner_only" on public.gallery_album_export_jobs with check (false);
