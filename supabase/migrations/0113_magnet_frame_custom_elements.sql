-- Photographer-uploaded decorative element images for the magnet-frame design tool — kept across
-- every future design (not scoped to one), same pattern as magnet_frame_custom_textures. Storage
-- path lives in the shared R2 bucket under the "magnet-frame-elements" prefix.
create table public.magnet_frame_custom_elements (
  id uuid primary key default gen_random_uuid(),
  photographer_id uuid not null references public.photographers(id) on delete cascade,
  storage_path text not null,
  original_filename text not null,
  created_at timestamptz not null default now()
);

create index magnet_frame_custom_elements_photographer_id_idx on public.magnet_frame_custom_elements(photographer_id);

alter table public.magnet_frame_custom_elements enable row level security;

create policy "magnet_frame_custom_elements_owner_only"
  on public.magnet_frame_custom_elements for all
  using (auth.uid() = photographer_id)
  with check (auth.uid() = photographer_id);
