-- A curated album the photographer builds from gallery photos, arranged into spreads (pages),
-- that the client proofs (comments, requests changes) and finally approves before it goes to
-- print. One album per gallery — created as a draft, only visible to the client once 'sent'.
create table public.gallery_albums (
  id uuid primary key default gen_random_uuid(),
  gallery_id uuid not null references public.galleries(id) on delete cascade unique,
  photographer_id uuid not null references public.photographers(id) on delete cascade,
  title text not null default 'האלבום שלכם',
  status text not null default 'draft' check (status in ('draft', 'sent', 'approved', 'changes_requested')),
  approved_at timestamptz,
  created_at timestamptz not null default now()
);

create index gallery_albums_gallery_id_idx on public.gallery_albums(gallery_id);

alter table public.gallery_albums enable row level security;

create policy "gallery_albums_owner_only"
  on public.gallery_albums for all
  using (auth.uid() = photographer_id)
  with check (auth.uid() = photographer_id);

-- A spread is one printed page/opening — one or two photos, in order. photo_id_2 null means a
-- single full-bleed photo on that spread.
create table public.gallery_album_spreads (
  id uuid primary key default gen_random_uuid(),
  album_id uuid not null references public.gallery_albums(id) on delete cascade,
  sort_order int not null,
  photo_id_1 uuid not null references public.gallery_photos(id) on delete cascade,
  photo_id_2 uuid references public.gallery_photos(id) on delete cascade,
  created_at timestamptz not null default now()
);

create index gallery_album_spreads_album_id_idx on public.gallery_album_spreads(album_id);

alter table public.gallery_album_spreads enable row level security;

create policy "gallery_album_spreads_owner_only"
  on public.gallery_album_spreads for all
  using (exists (
    select 1 from public.gallery_albums a where a.id = album_id and a.photographer_id = auth.uid()
  ))
  with check (exists (
    select 1 from public.gallery_albums a where a.id = album_id and a.photographer_id = auth.uid()
  ));

-- Client comments on a specific spread — written via a service-role API route (the client has no
-- Supabase auth session), read by the photographer through normal RLS.
create table public.gallery_album_comments (
  id uuid primary key default gen_random_uuid(),
  album_id uuid not null references public.gallery_albums(id) on delete cascade,
  spread_id uuid not null references public.gallery_album_spreads(id) on delete cascade,
  text text not null,
  created_at timestamptz not null default now()
);

create index gallery_album_comments_album_id_idx on public.gallery_album_comments(album_id);

alter table public.gallery_album_comments enable row level security;

create policy "gallery_album_comments_owner_read"
  on public.gallery_album_comments for select
  using (exists (
    select 1 from public.gallery_albums a where a.id = album_id and a.photographer_id = auth.uid()
  ));
