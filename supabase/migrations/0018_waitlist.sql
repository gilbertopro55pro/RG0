create table public.waitlist (
  id uuid primary key default gen_random_uuid(),
  photographer_id uuid not null references public.photographers(id) on delete cascade,
  requested_date date not null,
  client_name text not null,
  client_phone text,
  lead_id uuid references public.leads(id) on delete set null,
  notes text,
  created_at timestamptz not null default now()
);

create index waitlist_photographer_id_idx on public.waitlist(photographer_id);
create index waitlist_requested_date_idx on public.waitlist(requested_date);

alter table public.waitlist enable row level security;

create policy "waitlist_all_own"
  on public.waitlist for all
  using (auth.uid() = photographer_id)
  with check (auth.uid() = photographer_id);
