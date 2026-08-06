alter table public.events
  add column client_access_token uuid not null default gen_random_uuid() unique;
