-- Lets a PDF export's quality-step pass render a small BATCH of pages per invocation instead of
-- the whole pass in one call (see pdf_quality_step_index in 0098 for the same idea one level up).
-- Tracks how many pages of the CURRENT quality-step attempt have already been rendered into the
-- in-progress document (stashed at album-exports/{jobId}.pdf.partial-{stepIndex}) so the next
-- invocation can resume exactly where the last one left off.
alter table public.gallery_album_export_jobs
  add column pdf_page_index int not null default 0;
