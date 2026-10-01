-- Phone notifications (Web Push, owner 2026-10-01): one row per device a photographer turned
-- notifications on for. Written and read only by the server (service role) — the API routes check
-- the session and scope every query to the signed-in photographer.
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  photographer_id uuid not null references public.photographers(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  last_success_at timestamptz
);
create index if not exists push_subscriptions_photographer_idx on public.push_subscriptions (photographer_id);
alter table public.push_subscriptions enable row level security;
