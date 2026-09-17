-- A photographer-facing "follow up on this quote" nudge, fired 2 days after a quote is sent from
-- the leads page (src/app/api/leads/[id]/quote/route.ts) — distinct from the existing
-- lead_follow_up kind (0041), which messages the LEAD directly on a fixed 2/5/10-day cadence
-- starting from lead creation, regardless of whether a quote was ever sent.
alter table public.scheduled_messages
  drop constraint scheduled_messages_kind_check,
  add constraint scheduled_messages_kind_check
    check (kind in ('review_request', 'payment_reminder', 'lead_follow_up', 'lead_quote_followup'));

-- event_notifications was event-only until now — this kind has no event_id to hang a row off of
-- (a lead may never convert to an event), so event_id becomes nullable and lead_id is added
-- alongside it, mirroring exactly how scheduled_messages itself was extended in migration 0041.
alter table public.event_notifications
  alter column event_id drop not null,
  add column lead_id uuid references public.leads(id) on delete cascade;

alter table public.event_notifications
  add constraint event_notifications_target_check
    check ((event_id is not null) <> (lead_id is not null));

create index event_notifications_lead_id_idx on public.event_notifications(lead_id);

drop policy "event_notifications_all_own" on public.event_notifications;

create policy "event_notifications_all_own"
  on public.event_notifications for all
  using (
    (event_id is not null and public.is_event_owner(event_id))
    or (lead_id is not null and exists (
      select 1 from public.leads l where l.id = lead_id and l.photographer_id = auth.uid()
    ))
  )
  with check (
    (event_id is not null and public.is_event_owner(event_id))
    or (lead_id is not null and exists (
      select 1 from public.leads l where l.id = lead_id and l.photographer_id = auth.uid()
    ))
  );
