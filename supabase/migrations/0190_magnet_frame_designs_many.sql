-- Several magnet frames per photographer (owner, 2026-10-22): each design has a name, and may be
-- linked to one of the photographer's events. Until now the editor kept one design per account (the
-- latest row) and event_id was never set.
alter table public.magnet_frame_designs add column if not exists name text;

-- A write may only link the photographer's own event (security rule of 2026-10-13: a write policy
-- checks the parent row too, not only photographer_id).
alter policy "magnet_frame_designs_manage_by_photographer"
  on public.magnet_frame_designs
  using (photographer_id = auth.uid())
  with check (
    photographer_id = auth.uid()
    and (event_id is null or exists (select 1 from public.events e where e.id = event_id and e.photographer_id = auth.uid()))
  );
