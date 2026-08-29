-- Gates the one-time "connect your calendar / business ID / logo" screen shown right after a new
-- signup's first payment clears. Defaults to false so it fires for genuinely new accounts, but
-- every EXISTING photographer is backfilled to true in the same migration — otherwise this would
-- retroactively pop the screen for everyone already using the system on their next login.
alter table public.photographers add column onboarding_completed boolean not null default false;
update public.photographers set onboarding_completed = true;
