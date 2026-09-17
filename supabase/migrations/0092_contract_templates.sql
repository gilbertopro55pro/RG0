-- A library of reusable contract "terms" bodies per photographer, replacing the single
-- photographers.custom_contract_terms field for photographers who want more than one (e.g. a
-- wedding contract vs. a freelance/single-day contract). custom_contract_terms stays as the
-- fallback used when no specific template is selected (see /api/events/[id]/contract), so nothing
-- about the existing single-template flow breaks.
create table public.contract_templates (
  id uuid primary key default gen_random_uuid(),
  photographer_id uuid not null references public.photographers(id) on delete cascade,
  name text not null,
  terms text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index contract_templates_photographer_id_idx on public.contract_templates(photographer_id);

alter table public.contract_templates enable row level security;

create policy "contract_templates_manage_by_photographer"
  on public.contract_templates for all
  using (photographer_id = auth.uid())
  with check (photographer_id = auth.uid());

-- Which saved template (if any) an event's contract was generated from — lets the "new event"
-- flow's contract step remember the photographer's choice, and lets event_contracts regeneration
-- reuse it. Nullable: events using the plain default/custom_contract_terms fallback, or created
-- before this feature, have no template row to point at.
alter table public.events
  add column contract_template_id uuid references public.contract_templates(id) on delete set null;

-- Set when the photographer explicitly chooses not to use a contract for this event (the "דלג"
-- step in the new-event flow) — distinguishes "skipped on purpose" from "just hasn't gotten to it
-- yet" so the event_closing banner in EventDetailView knows to show the send-update prompt either
-- way (contract signed, OR contract deliberately skipped) but not while a contract is still
-- pending signature.
alter table public.events
  add column contract_skipped boolean not null default false;
