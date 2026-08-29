-- Custom ornament tabs + uploaded ornaments — desktop app feature (photographer-flow-desktop):
-- photographers can create their own tabs of decorative overlay graphics uploaded from their own
-- computer, alongside the app's built-in procedural floral/geometric/vintage ornaments.

create table public.custom_ornament_tabs (
  id uuid primary key default gen_random_uuid(),
  photographer_id uuid not null references public.photographers(id) on delete cascade,
  name text not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create index custom_ornament_tabs_photographer_id_idx on public.custom_ornament_tabs(photographer_id);

alter table public.custom_ornament_tabs enable row level security;

create policy "custom_ornament_tabs_owner_only"
  on public.custom_ornament_tabs for all
  using (auth.uid() = photographer_id)
  with check (auth.uid() = photographer_id);

create table public.custom_ornaments (
  id uuid primary key default gen_random_uuid(),
  tab_id uuid not null references public.custom_ornament_tabs(id) on delete cascade,
  photographer_id uuid not null references public.photographers(id) on delete cascade,
  storage_path text not null,
  original_filename text not null,
  created_at timestamptz not null default now()
);

create index custom_ornaments_tab_id_idx on public.custom_ornaments(tab_id);
create index custom_ornaments_photographer_id_idx on public.custom_ornaments(photographer_id);

alter table public.custom_ornaments enable row level security;

create policy "custom_ornaments_owner_only"
  on public.custom_ornaments for all
  using (auth.uid() = photographer_id)
  with check (auth.uid() = photographer_id);
