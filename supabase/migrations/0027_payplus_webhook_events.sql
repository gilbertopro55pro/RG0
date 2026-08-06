-- Mirrors whatsapp_webhook_events — raw payload capture for debugging PayPlus callback shape,
-- since their docs don't fully specify field nesting and the real payload needs verifying.
create table public.payplus_webhook_events (
  id uuid primary key default gen_random_uuid(),
  payload jsonb not null,
  created_at timestamptz not null default now()
);

alter table public.payplus_webhook_events enable row level security;
