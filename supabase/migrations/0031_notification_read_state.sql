-- Tracks whether a notification represents a genuine client-initiated action (contract signed,
-- gallery selection confirmed/updated) and whether the photographer has seen it yet, so the
-- dashboard can show an unread-progress badge on the event card without counting the photographer's
-- own actions or automated system messages as "new".
alter table public.event_notifications
  add column is_client_action boolean not null default false,
  add column read_at timestamptz;

-- Existing rows predate the badge feature — mark them all as already-seen so photographers don't
-- suddenly get a flood of unread counts on events that were already fully handled.
update public.event_notifications set read_at = created_at where read_at is null;
