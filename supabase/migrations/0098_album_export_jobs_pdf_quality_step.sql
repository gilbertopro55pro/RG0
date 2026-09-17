-- PDF exports can need several full re-render passes at descending JPEG quality to hit their
-- target file size (see QUALITY_STEPS in albumExportJobs.ts). That used to all happen inside one
-- serverless invocation's loop — if the invocation ran out of time mid-loop, the retry cron would
-- restart the WHOLE loop from the first (largest, slowest) quality step again, every time. This
-- column lets each quality-step pass run as its own fresh invocation (chained like gallery_zip_jobs'
-- own parts), so a pass that doesn't fit under the target size hands off to a new invocation for the
-- next step instead of looping inline.
alter table public.gallery_album_export_jobs
  add column pdf_quality_step_index int not null default 0;
