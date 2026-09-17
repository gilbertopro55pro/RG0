-- Single-row heartbeat table the PDF export worker (worker/src/index.ts, Fly.io) writes to on
-- every poll tick, and the web app reads before starting a new PDF export job — see
-- src/lib/renderWorkerHealth.ts. Lets the app tell "the worker is running code older than what's
-- currently deployed on Vercel" (code_hash mismatch) and "the worker isn't running at all right
-- now" (stale last_heartbeat_at) apart from "everything's fine," instead of silently starting a
-- job a stale/dead worker will pick up with outdated rendering logic (or never pick up at all).
create table public.worker_status (
  id int primary key default 1,
  code_hash text not null,
  last_heartbeat_at timestamptz not null default now(),
  constraint worker_status_singleton check (id = 1)
);

alter table public.worker_status enable row level security;

-- No photographer-facing reads/writes at all — only the service-role client (the worker itself,
-- and the export-pdf route's pre-flight check) ever touches this table.
