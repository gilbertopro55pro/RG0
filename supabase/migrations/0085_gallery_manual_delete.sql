-- Lets a photographer archive a gallery manually (instead of only via natural expiry), and
-- distinguishes why a gallery ended up archived so the new "פג תוקף" list tab can label it
-- correctly. Manual deletes get a longer 14-day grace window than the cron's natural-expiry
-- 7 days (see ARCHIVE_TO_DELETE_DAYS in gallery-lifecycle/route.ts) — a deliberate photographer
-- action deserves more room to reconsider than a gallery that simply timed out.
alter table public.galleries add column archive_reason text
  check (archive_reason is null or archive_reason in ('expired', 'manual'));
