-- Photographer-designed (not AI-generated) magnet frame: a plain white base with a transparent
-- photo cutout, onto which the photographer freely places text and decorative elements — distinct
-- from frame_requests (the AI-generated decorative-border product). One row per design; the
-- landscape (20x15cm) canvas is what the photographer edits directly, and portrait_elements is
-- auto-derived from landscape_elements at save time (same elements, since xPct/yPct/sizePct are
-- already relative to each canvas's own dimensions — see MagnetFrameEditor.tsx).
create table public.magnet_frame_designs (
  id uuid primary key default gen_random_uuid(),
  photographer_id uuid not null references public.photographers(id) on delete cascade,
  event_id uuid references public.events(id) on delete set null,
  landscape_elements jsonb not null default '[]'::jsonb,
  portrait_elements jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index magnet_frame_designs_photographer_id_idx on public.magnet_frame_designs(photographer_id);
create index magnet_frame_designs_event_id_idx on public.magnet_frame_designs(event_id);

alter table public.magnet_frame_designs enable row level security;

create policy "magnet_frame_designs_manage_by_photographer"
  on public.magnet_frame_designs for all
  using (photographer_id = auth.uid())
  with check (photographer_id = auth.uid());
