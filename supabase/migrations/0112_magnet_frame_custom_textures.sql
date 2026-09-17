-- Photographer-uploaded texture images for the magnet-frame mat (alongside the 40 built-in
-- MAGNET_FRAME_TEXTURES) — tiled across the mat only, same as a built-in texture, at a controllable
-- opacity. Storage path lives in the shared R2 bucket under the "magnet-frame-textures" prefix.
create table public.magnet_frame_custom_textures (
  id uuid primary key default gen_random_uuid(),
  photographer_id uuid not null references public.photographers(id) on delete cascade,
  storage_path text not null,
  original_filename text not null,
  created_at timestamptz not null default now()
);

create index magnet_frame_custom_textures_photographer_id_idx on public.magnet_frame_custom_textures(photographer_id);

alter table public.magnet_frame_custom_textures enable row level security;

create policy "magnet_frame_custom_textures_owner_only"
  on public.magnet_frame_custom_textures for all
  using (auth.uid() = photographer_id)
  with check (auth.uid() = photographer_id);
