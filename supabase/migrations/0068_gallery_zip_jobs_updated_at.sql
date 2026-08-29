-- created_at only tells you when a part was first queued, not when it last changed status — the
-- stuck-job retry cron needs to tell "this part is still waiting its turn in a long batch" apart
-- from "this part's invocation crashed mid-processing", which requires knowing how long it's
-- actually been in its CURRENT status, not how old the row is overall.
alter table public.gallery_zip_jobs add column updated_at timestamptz not null default now();
