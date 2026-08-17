-- A whole-book template (every page's frame layout, in order) saved from the album-creation
-- wizard's auto-generated result — distinct from album_templates, which stores a single page's
-- frames for reuse on one page at a time.
create table public.album_book_templates (
  id uuid primary key default gen_random_uuid(),
  photographer_id uuid not null references public.photographers(id) on delete cascade,
  name text not null,
  style text not null,
  pages jsonb not null,
  created_at timestamptz not null default now()
);

create index album_book_templates_photographer_id_idx on public.album_book_templates(photographer_id);

alter table public.album_book_templates enable row level security;

create policy "album_book_templates_owner_only"
  on public.album_book_templates for all
  using (photographer_id = auth.uid())
  with check (photographer_id = auth.uid());
