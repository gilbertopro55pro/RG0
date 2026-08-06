create table public.gallery_folders (
  id uuid primary key default gen_random_uuid(),
  gallery_id uuid not null references public.galleries(id) on delete cascade,
  photographer_id uuid not null references public.photographers(id) on delete cascade,
  name text not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  unique (gallery_id, name)
);

create index gallery_folders_gallery_id_idx on public.gallery_folders(gallery_id);

alter table public.gallery_folders enable row level security;

create policy "gallery_folders_all_own"
  on public.gallery_folders for all
  using (auth.uid() = photographer_id)
  with check (auth.uid() = photographer_id);

alter table public.gallery_photos
  add column folder_id uuid references public.gallery_folders(id) on delete set null;
