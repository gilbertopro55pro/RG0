create table public.galleries (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  photographer_id uuid not null references public.photographers(id) on delete cascade,
  title text not null default 'הגלריה שלכם',
  access_token uuid not null default gen_random_uuid() unique,
  password text,
  published boolean not null default false,
  cover_photo_id uuid,
  created_at timestamptz not null default now(),
  unique (event_id)
);

alter table public.galleries enable row level security;

create policy "galleries_all_own"
  on public.galleries for all
  using (auth.uid() = photographer_id)
  with check (auth.uid() = photographer_id);

create table public.gallery_photos (
  id uuid primary key default gen_random_uuid(),
  gallery_id uuid not null references public.galleries(id) on delete cascade,
  photographer_id uuid not null references public.photographers(id) on delete cascade,
  storage_path text not null,
  original_filename text not null,
  file_size_bytes bigint not null default 0,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create index gallery_photos_gallery_id_idx on public.gallery_photos(gallery_id);

alter table public.gallery_photos enable row level security;

create policy "gallery_photos_all_own"
  on public.gallery_photos for all
  using (auth.uid() = photographer_id)
  with check (auth.uid() = photographer_id);

alter table public.galleries
  add constraint galleries_cover_photo_fk foreign key (cover_photo_id)
    references public.gallery_photos(id) on delete set null;

-- Private bucket — nothing is served directly from it. The photographer's own browser client
-- uploads/manages files here (RLS below, scoped to their own uid as the top-level path folder).
-- Public gallery viewers never touch this bucket directly; the public page generates short-lived
-- signed URLs server-side via the service-role client, same pattern as every other public token
-- page in this app (portal/contracts/quotes).
insert into storage.buckets (id, name, public)
values ('galleries', 'galleries', false)
on conflict (id) do nothing;

create policy "gallery_storage_owner_all"
  on storage.objects for all
  using (bucket_id = 'galleries' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'galleries' and (storage.foldername(name))[1] = auth.uid()::text);
