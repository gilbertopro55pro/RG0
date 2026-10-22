-- A reminder 3 days before the event to send the client the "יום הצילום" message from the client
-- messages settings (owner, 2026-10-22, "עדכון שקוף"). The daily send-scheduled-messages cron adds
-- an awaiting_confirmation row and a phone notification; the home screen shows the message window.
-- On for every photographer, switched off in Settings › Automation.

alter table photographers
  add column if not exists shoot_day_reminder boolean not null default true;

alter table scheduled_messages drop constraint if exists scheduled_messages_kind_check;
alter table scheduled_messages
  add constraint scheduled_messages_kind_check check (
    kind = any (array[
      'review_request', 'payment_reminder', 'lead_follow_up', 'lead_quote_followup',
      'album_approval_reminder', 'song_selection_reminder', 'shoot_day_reminder'
    ])
  );
