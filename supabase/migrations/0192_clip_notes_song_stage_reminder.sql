-- Clip notes and the song-stage reminder (owner, 2026-10-25, "עדכון שקוף").
--
-- 1. In a package with a clip, the client writes notes for the clip in the portal
--    (api/portal/[token]/clip-notes, service role, by the portal token). The photographer sees and
--    copies them on the event page, without an edit field (lib/clipNotes.ts).
-- 2. While the clip song-selection stage is the current stage or was left open, the daily
--    send-scheduled-messages cron reminds the photographer to remind the client: an
--    awaiting_confirmation row of kind song_stage_reminder, a phone notification, and the message
--    window on the home screen (lib/songStageReminder.ts). On for every photographer, switched off
--    in Settings › Automation.

alter table events
  add column if not exists clip_notes text,
  add column if not exists clip_notes_at timestamptz;

alter table events drop constraint if exists events_clip_notes_length;
alter table events
  add constraint events_clip_notes_length check (clip_notes is null or char_length(clip_notes) <= 2000);

alter table photographers
  add column if not exists song_stage_reminder boolean not null default true;

alter table scheduled_messages drop constraint if exists scheduled_messages_kind_check;
alter table scheduled_messages
  add constraint scheduled_messages_kind_check check (
    kind = any (array[
      'review_request', 'payment_reminder', 'lead_follow_up', 'lead_quote_followup',
      'album_approval_reminder', 'song_selection_reminder', 'shoot_day_reminder', 'song_stage_reminder'
    ])
  );
