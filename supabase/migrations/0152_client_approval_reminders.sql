-- Reminders to the photographer to nudge a client (2026-10-04, owner's request):
-- album_approval_reminder: 3 days after the "album design ready" message, if the client hasn't
--   approved it (events.album_approved_at, set from the portal or the gallery album approval).
-- song_selection_reminder: 3 days after the "full film ready" message, if the client hasn't picked
--   the clip songs (the song stage done, or events.songs_chosen_at from the portal).
alter table public.scheduled_messages drop constraint if exists scheduled_messages_kind_check;
alter table public.scheduled_messages add constraint scheduled_messages_kind_check
  check (kind = any (array['review_request','payment_reminder','lead_follow_up','lead_quote_followup','album_approval_reminder','song_selection_reminder']));
alter table public.events add column if not exists album_approved_at timestamptz;
alter table public.events add column if not exists songs_chosen_at timestamptz;
