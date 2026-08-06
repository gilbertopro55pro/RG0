create table public.leads (
  id uuid primary key default gen_random_uuid(),
  photographer_id uuid not null references public.photographers(id) on delete cascade,
  name text not null,
  phone text,
  email text,
  event_date_interest date,
  package_interest text,
  status text not null default 'new' check (status in ('new', 'contacted', 'quoted', 'won', 'lost')),
  notes text,
  quoted_amount numeric(10, 2),
  quote_token uuid not null default gen_random_uuid() unique,
  quote_note text,
  quote_sent_at timestamptz,
  converted_event_id uuid references public.events(id) on delete set null,
  created_at timestamptz not null default now()
);

create index leads_photographer_id_idx on public.leads(photographer_id);

alter table public.leads enable row level security;

create policy "leads_all_own"
  on public.leads for all
  using (auth.uid() = photographer_id)
  with check (auth.uid() = photographer_id);
