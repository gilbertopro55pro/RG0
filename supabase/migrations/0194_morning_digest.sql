-- Morning notification (owner, 2026-10-26): at 08:00 Israel time, a phone notification with the
-- day's open tasks (lib/tasks.ts, table tasks) and the next shoot (lib/morningDigest.ts,
-- api/cron/morning-digest). On by default; switched off in Settings › Automation or in the tasks
-- panel. morning_digest_sent_on: the Israel date it was last sent, so it goes out once a day.
alter table public.photographers
  add column if not exists morning_digest boolean not null default true,
  add column if not exists morning_digest_sent_on date;
