create table public.whatsapp_webhook_events (
  id uuid primary key default gen_random_uuid(),
  payload jsonb not null,
  created_at timestamptz not null default now()
);

alter table public.whatsapp_webhook_events enable row level security;
