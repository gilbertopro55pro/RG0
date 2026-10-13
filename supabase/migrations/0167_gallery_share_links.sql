-- Read-only share links for a client's gallery (owner's decision, 2026-10-13).
-- Until now the "share my gallery" button in the client's gallery passed on the client's own link
-- (galleries.access_token) with ?folders= / ?photos= / ?quality= added. Those were only view
-- filters: a guest could remove them and see every photo at full quality, and the same token let
-- them change the client's favorites, confirm the selection, approve the album or upload. A share
-- now gets its own token, with its scope stored here and enforced on the server; every write route
-- still accepts only galleries.access_token, so a share token can't write anything.
create table if not exists gallery_share_links (
  token uuid primary key default gen_random_uuid(),
  gallery_id uuid not null references galleries(id) on delete cascade,
  folder_keys text[],  -- null = every tab; 'none' = photos without a tab
  photo_ids uuid[],    -- null = no photo filter
  quality text not null default 'full' check (quality in ('full', 'web')),
  created_at timestamptz not null default now()
);
create index if not exists gallery_share_links_gallery_idx on gallery_share_links (gallery_id);
-- Server only (service role): no policies.
alter table gallery_share_links enable row level security;
