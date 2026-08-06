-- Replaces the flat "one price per package" model from migration 0019 (still empty/unused —
-- real pricing turns out to depend on event occasion type too, e.g. a morning aliyah-latorah
-- vs. an evening bar-mitzvah vs. a wedding all price differently for the same package).
drop table if exists public.package_prices;

create table public.event_types (
  id uuid primary key default gen_random_uuid(),
  photographer_id uuid not null references public.photographers(id) on delete cascade,
  name text not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  unique (photographer_id, name)
);

create index event_types_photographer_id_idx on public.event_types(photographer_id);

alter table public.event_types enable row level security;

create policy "event_types_all_own"
  on public.event_types for all
  using (auth.uid() = photographer_id)
  with check (auth.uid() = photographer_id);

create table public.package_prices (
  id uuid primary key default gen_random_uuid(),
  photographer_id uuid not null references public.photographers(id) on delete cascade,
  event_type_id uuid not null references public.event_types(id) on delete cascade,
  package text not null check (package in ('stills', 'stills_reel', 'stills_video', 'full', 'full_second')),
  -- null = not offered for this event type / photographer should be contacted directly
  price numeric(10, 2),
  unique (event_type_id, package)
);

create index package_prices_photographer_id_idx on public.package_prices(photographer_id);

alter table public.package_prices enable row level security;

create policy "package_prices_all_own"
  on public.package_prices for all
  using (auth.uid() = photographer_id)
  with check (auth.uid() = photographer_id);

-- Denormalized snapshot so a lead/quote still shows what occasion it was for even if the
-- photographer later renames or deletes that event type.
alter table public.leads
  add column event_type_name text;
