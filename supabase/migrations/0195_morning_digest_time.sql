-- The daily tasks reminder at a time the photographer chooses (owner, 2026-10-26; was fixed at
-- 08:00): minutes after midnight, Israel time, in half hours from 05:00 to 23:00
-- (lib/morningDigest.ts). The cron (api/cron/morning-digest) now runs every half hour.
alter table public.photographers
  add column if not exists morning_digest_minutes smallint not null default 480
    check (morning_digest_minutes between 300 and 1380 and morning_digest_minutes % 30 = 0);
