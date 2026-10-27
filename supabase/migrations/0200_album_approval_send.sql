-- Sending the album design to the client for approval (owner, 2026-10-27):
-- - gallery_albums.sent_at: when the photographer last sent it (the send window of the album tool,
--   api/galleries/[id]/album/send). The home screen's event row says "עיצוב האלבום נשלח לאישור
--   בתאריך: …" from it.
-- - The reminder to nudge the client when the design isn't approved yet (album_approval_reminder in
--   scheduled_messages, lib/clientReminders.ts): on/off and after how many days, 1–14, 3 by default,
--   in Settings › Notifications & automation (AlbumApprovalReminderSettings).
alter table public.gallery_albums
  add column if not exists sent_at timestamptz;

alter table public.photographers
  add column if not exists album_approval_reminder boolean not null default true,
  add column if not exists album_approval_reminder_days smallint not null default 3;

alter table public.photographers
  add constraint photographers_album_approval_reminder_days_check check (album_approval_reminder_days between 1 and 14);
