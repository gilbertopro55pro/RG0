create table public.event_contracts (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  sign_token uuid not null default gen_random_uuid() unique,
  contract_text text not null,
  status text not null default 'draft' check (status in ('draft', 'sent', 'signed')),
  signer_name text,
  signer_ip text,
  signed_at timestamptz,
  created_at timestamptz not null default now()
);

create index event_contracts_event_id_idx on public.event_contracts(event_id);

alter table public.event_contracts enable row level security;

-- Owner-only via the app's normal auth. The public client-facing sign page goes through the
-- service-role client keyed by the unguessable sign_token — it never uses this policy.
create policy "event_contracts_all_own"
  on public.event_contracts for all
  using (event_id in (select id from public.events where photographer_id = auth.uid()))
  with check (event_id in (select id from public.events where photographer_id = auth.uid()));
