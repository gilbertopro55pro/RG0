-- A photographer's personal library of reusable page layouts — just the empty frame shapes
-- (position/size), deliberately holding no photo/style data so the same template applies cleanly
-- to any album. Applying one to a spread creates empty photo-frame elements from `frames`; the
-- photographer fills each via the "+" picker (or the app best-effort auto-fills from favorites).
create table public.album_templates (
  id uuid primary key default gen_random_uuid(),
  photographer_id uuid not null references public.photographers(id) on delete cascade,
  name text not null,
  frames jsonb not null,
  created_at timestamptz not null default now()
);

create index album_templates_photographer_id_idx on public.album_templates(photographer_id);

alter table public.album_templates enable row level security;

create policy "album_templates_owner_only"
  on public.album_templates for all
  using (auth.uid() = photographer_id)
  with check (auth.uid() = photographer_id);
