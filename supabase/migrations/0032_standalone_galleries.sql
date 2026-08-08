-- Lets a photographer create a gallery that isn't tied to any event in the system (e.g. a standalone
-- photoshoot never booked as an "event"), plus fields the new gallery creation/edit screen needs:
-- a shoot date (only meaningful when there's no event to supply one), a client email for the
-- pre-deletion reminder, and a real download-permission toggle.
alter table public.galleries
  alter column event_id drop not null,
  add column shoot_date date,
  add column client_email text,
  add column allow_downloads boolean not null default true;

-- expiry_months now doubles as "store indefinitely" via null (paired with a null expires_at,
-- which the lifecycle cron already treats as non-expiring).
alter table public.galleries drop constraint if exists galleries_expiry_months_check;
alter table public.galleries alter column expiry_months drop not null;
alter table public.galleries add constraint galleries_expiry_months_check
  check (expiry_months is null or expiry_months in (1, 3, 6));
