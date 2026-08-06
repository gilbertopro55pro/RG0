alter table public.photographers
  add column google_access_token text,
  add column google_refresh_token text,
  add column google_token_expiry timestamptz,
  add column google_calendar_connected boolean not null default false;
