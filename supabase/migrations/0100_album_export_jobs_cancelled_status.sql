-- Cancelling an export used to only abort the CLIENT's own polling loop — the server-side job kept
-- running (or, worse, kept getting auto-retried forever by the retry-stuck-jobs cron once that
-- became reliable) with nothing ever telling it the photographer actually cancelled. Confirmed live
-- 2026-09-02: leftover jobs from an earlier debugging session were STILL being retried by the cron
-- days later, competing for the same gallery's R2/render resources against a real, unrelated export
-- and visibly slowing it down. A real "cancelled" status lets a cancel actually stop the job
-- server-side — the cron's own pending/processing pickup only ever touches those two statuses, so a
-- cancelled row is naturally left alone from that point on.
alter table public.gallery_album_export_jobs
  drop constraint gallery_album_export_jobs_status_check,
  add constraint gallery_album_export_jobs_status_check check (status in ('pending', 'processing', 'ready', 'failed', 'cancelled'));
