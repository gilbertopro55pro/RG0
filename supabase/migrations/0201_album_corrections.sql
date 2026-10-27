-- The client marks corrections on the album design (owner, 2026-10-27): in the gallery's album view,
-- "צריך תיקונים" opens the design with a pencil and a rectangle, in 3 colours, and a note per page.
-- One row per submission; `pages` holds the marks per page, in fractions (0–1) of the page box:
--   [{ "spreadId": uuid, "note": text|null,
--      "marks": [{ "kind": "pen", "color": "#…", "points": [[x, y], …] }
--              | { "kind": "rect", "color": "#…", "x": n, "y": n, "w": n, "h": n }] }]
-- Written only by the server (api/gallery/[token]/album/corrections, service role) after checking the
-- client's gallery link; the photographer reads their own (the corrections page, /album-corrections/<id>),
-- and seen_at is set by the server too.
create table if not exists public.gallery_album_corrections (
  id uuid primary key default gen_random_uuid(),
  album_id uuid not null references public.gallery_albums(id) on delete cascade,
  gallery_id uuid not null references public.galleries(id) on delete cascade,
  photographer_id uuid not null references public.photographers(id) on delete cascade,
  pages jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  seen_at timestamptz
);

create index if not exists gallery_album_corrections_album_idx on public.gallery_album_corrections (album_id, created_at desc);

alter table public.gallery_album_corrections enable row level security;

create policy gallery_album_corrections_select_own on public.gallery_album_corrections
  for select using (photographer_id = auth.uid());

-- When the client approves the design in the gallery, the album goes to the print house by itself
-- (JPG at the album's size, the default print house address). On by default (the owner's request);
-- the switch is in Settings › Notifications & automation.
alter table public.photographers
  add column if not exists album_auto_print boolean not null default true;
