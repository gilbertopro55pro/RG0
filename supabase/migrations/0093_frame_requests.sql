-- AI-generated photo-frame overlays (transparent-center PNGs, for a magnets/frame package add-on).
-- Two entry points: the client portal (event_id set, client describes the frame) and the
-- photographer's own dashboard (event_id null, photographer testing/generating without a
-- specific booking) — see FrameGeneratorTool.tsx and its two route families.
create table public.frame_requests (
  id uuid primary key default gen_random_uuid(),
  photographer_id uuid not null references public.photographers(id) on delete cascade,
  event_id uuid references public.events(id) on delete set null,
  description text not null,
  status text not null default 'ready' check (status in ('generating', 'ready', 'sent', 'failed')),
  created_at timestamptz not null default now()
);

create index frame_requests_photographer_id_idx on public.frame_requests(photographer_id);
create index frame_requests_event_id_idx on public.frame_requests(event_id);

-- One row per generated image — 2 styles x 2 orientations (portrait 15x20cm, landscape 20x15cm)
-- per generation/regeneration round. A "regenerate" replaces every row+object for its request
-- wholesale (delete then re-insert), never appends, so there's never more than 4 live rows per
-- request at a time.
create table public.frame_images (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.frame_requests(id) on delete cascade,
  style_number smallint not null check (style_number in (1, 2)),
  orientation text not null check (orientation in ('portrait', 'landscape')),
  storage_path text not null,
  created_at timestamptz not null default now()
);

create index frame_images_request_id_idx on public.frame_images(request_id);

alter table public.frame_requests enable row level security;
alter table public.frame_images enable row level security;

-- Photographer-side (dashboard usage, and viewing/managing anything from the portal side too).
create policy "frame_requests_manage_by_photographer"
  on public.frame_requests for all
  using (photographer_id = auth.uid())
  with check (photographer_id = auth.uid());

create policy "frame_images_manage_by_photographer"
  on public.frame_images for all
  using (exists (select 1 from public.frame_requests fr where fr.id = request_id and fr.photographer_id = auth.uid()))
  with check (exists (select 1 from public.frame_requests fr where fr.id = request_id and fr.photographer_id = auth.uid()));

-- No client-facing RLS policy: the portal is an anonymous, token-authenticated surface (no
-- Supabase auth session at all), so every portal-side read/write goes through service-role API
-- routes (/api/portal/[token]/frame-requests/...), exactly like the rest of the client portal.
