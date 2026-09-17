-- Enforces "one active export at a time per photographer" at the database level — the application
-- check (findActiveExportJob in albumExportJobs.ts, query-then-insert) has a real race: two export
-- requests arriving close together (a double-click, two tabs, the desktop app and the web app at
-- once) can both run the "any active job?" check before either one's INSERT lands, both see none,
-- and both create a job — confirmed live 2026-09-15: two JPG export jobs for the same album were
-- created one second apart and both rendered the full 19-page album redundantly. A partial unique
-- index makes the second concurrent INSERT fail outright (a real constraint, not a racy check), and
-- the create routes catch that specific failure and return the job that won the race as "already
-- active" instead of erroring — same outcome the non-racing path already had, just now guaranteed.
create unique index gallery_album_export_jobs_one_active_per_photographer
  on public.gallery_album_export_jobs (photographer_id)
  where status in ('pending', 'processing');
