alter table public.galleries
  add column expiry_months int not null default 3 check (expiry_months in (1, 3, 6)),
  add column published_at timestamptz,
  add column expires_at timestamptz,
  add column archived_at timestamptz,
  add column permanent_delete_at timestamptz;
