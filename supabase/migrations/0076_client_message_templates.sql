-- Per-photographer customizable text for the "send update to client" buttons (EventDetailView's
-- SendUpdateButton flow). One row per customized stage; a stage with no row falls back to
-- DEFAULT_CLIENT_MESSAGE_TEMPLATE in src/lib/stages.ts.
create table public.client_message_templates (
  id uuid primary key default gen_random_uuid(),
  photographer_id uuid not null references public.photographers(id) on delete cascade,
  stage_key text not null,
  body text not null,
  updated_at timestamptz not null default now(),
  unique (photographer_id, stage_key)
);

create index client_message_templates_photographer_id_idx on public.client_message_templates(photographer_id);

alter table public.client_message_templates enable row level security;

create policy "client_message_templates_manage_by_photographer"
  on public.client_message_templates for all
  using (photographer_id = auth.uid())
  with check (photographer_id = auth.uid());

-- Assigned team members send updates too, so they need read access to the same templates.
create policy "client_message_templates_select_assigned"
  on public.client_message_templates for select
  using (photographer_id in (select photographer_id from public.team_members where id = auth.uid()));
