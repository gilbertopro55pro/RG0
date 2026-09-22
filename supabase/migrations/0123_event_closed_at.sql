-- An event is now CLOSED only by an explicit "סגירת אירוע" + confirmation (and reopened with
-- "שחזור אירוע") — marking every stage done no longer closes it. closed_at is the single source of
-- truth for the events list's "הושלמו" filter and the card's closed state.
alter table public.events add column closed_at timestamptz;

-- Backfill: until now "closed" was inferred from every stage being done, so events that already
-- looked completed stay completed (closed at their last stage's completion time) instead of all
-- flooding back into the active list.
update public.events e
set closed_at = coalesce(
  (select max(s.done_at) from public.event_stages s where s.event_id = e.id),
  e.created_at
)
where exists (select 1 from public.event_stages s where s.event_id = e.id)
  and not exists (select 1 from public.event_stages s where s.event_id = e.id and s.done = false);

-- The auto-created "ברירת מחדל" package's final stage no longer auto-opens a WhatsApp message when
-- marked done (matches the built-in "מסירה סופית" stage) — it just gets marked done, and the
-- photographer sends the update themselves with the normal per-stage button.
update public.custom_package_stages
set notify_client = false, notify_text = null
where name = 'מסירה סופית'
  and package_id in (select id from public.custom_packages where name = 'ברירת מחדל');
