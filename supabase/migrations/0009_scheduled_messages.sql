-- Generic future-dated message scheduler — used for the post-delivery review request now,
-- and reusable later for payment reminders without a second table.
create table public.scheduled_messages (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  kind text not null check (kind in ('review_request', 'payment_reminder')),
  send_at timestamptz not null,
  status text not null default 'pending' check (status in ('pending', 'sent', 'canceled', 'failed')),
  created_at timestamptz not null default now(),
  sent_at timestamptz
);

create index scheduled_messages_send_at_idx on public.scheduled_messages(send_at) where status = 'pending';
create index scheduled_messages_event_id_idx on public.scheduled_messages(event_id);

alter table public.scheduled_messages enable row level security;

create policy "scheduled_messages_owner_only"
  on public.scheduled_messages for all
  using (public.is_event_owner(event_id))
  with check (public.is_event_owner(event_id));
