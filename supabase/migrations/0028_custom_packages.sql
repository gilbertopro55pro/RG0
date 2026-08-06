-- Photographer-defined custom packages: an alternative to the 5 fixed built-in package flows,
-- for photographers whose workflow doesn't match any of them. Each has its own name, price, and
-- an ordered list of stages (which can notify the client, and/or require an album-design PDF
-- upload before completion — mirroring the built-in album_approval stage's behavior).
create table public.custom_packages (
  id uuid primary key default gen_random_uuid(),
  photographer_id uuid not null references public.photographers(id) on delete cascade,
  name text not null,
  price numeric(10, 2),
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create index custom_packages_photographer_id_idx on public.custom_packages(photographer_id);

alter table public.custom_packages enable row level security;

create policy "custom_packages_all_own"
  on public.custom_packages for all
  using (auth.uid() = photographer_id)
  with check (auth.uid() = photographer_id);

create table public.custom_package_stages (
  id uuid primary key default gen_random_uuid(),
  package_id uuid not null references public.custom_packages(id) on delete cascade,
  photographer_id uuid not null references public.photographers(id) on delete cascade,
  name text not null,
  sort_order int not null,
  notify_client boolean not null default false,
  notify_text text,
  requires_album_pdf boolean not null default false,
  created_at timestamptz not null default now()
);

create index custom_package_stages_package_id_idx on public.custom_package_stages(package_id);

alter table public.custom_package_stages enable row level security;

create policy "custom_package_stages_all_own"
  on public.custom_package_stages for all
  using (auth.uid() = photographer_id)
  with check (auth.uid() = photographer_id);

-- An event now points at either a built-in package (existing enum column) or a custom one —
-- exactly one of the two. Postgres CHECK constraints pass automatically when either side is
-- null, so just relaxing the NOT NULL on `package` and adding an explicit xor check is enough.
alter table public.events alter column package drop not null;
alter table public.events add column custom_package_id uuid references public.custom_packages(id);
alter table public.events add constraint events_package_xor_custom check (
  (package is not null and custom_package_id is null) or (package is null and custom_package_id is not null)
);

-- Same duality for stage rows: a built-in stage_key, or a custom_stage_id pointing at a
-- custom_package_stages row. Multiple NULLs in a unique column don't conflict with each other in
-- Postgres, so the existing `unique (event_id, stage_key)` from migration 0001 still holds fine
-- once stage_key is nullable.
alter table public.event_stages alter column stage_key drop not null;
alter table public.event_stages add column custom_stage_id uuid references public.custom_package_stages(id) on delete cascade;
alter table public.event_stages add constraint event_stages_key_xor_custom check (
  (stage_key is not null and custom_stage_id is null) or (stage_key is null and custom_stage_id is not null)
);
alter table public.event_stages add constraint event_stages_custom_unique unique (event_id, custom_stage_id);
