-- Business decision, 2026-09-16: standard ("פרו") gets a real storage cap (750GB, enforced purely
-- app-side — see STORAGE_CAP_BYTES_BY_TIER in src/lib/stages.ts, nothing to migrate for that part)
-- and a wider gallery-retention window (up to 90 days, was 30); studio_pro ("פרו+") widens to up to
-- a full year (365 days, was 180). Mirrors both changes into the same DB trigger migrations 0084
-- and 0116 introduced, so retention is enforced here too, not just offered client-side.
alter table public.galleries drop constraint galleries_expiry_days_check;
alter table public.galleries add constraint galleries_expiry_days_check
  check (expiry_days is null or expiry_days in (7, 14, 30, 90, 180, 365));

create or replace function public.enforce_gallery_expiry_by_plan()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  photographer_plan text;
  photographer_email text;
  allowed_days int[];
begin
  if tg_op = 'UPDATE' and new.expiry_days is not distinct from old.expiry_days then
    return new;
  end if;

  select plan, email into photographer_plan, photographer_email
  from public.photographers where id = new.photographer_id;

  -- Mirrors ADMIN_EMAIL in src/lib/admin.ts — same override already used for FTP Live, so the
  -- admin account isn't boxed in by whatever plan it happens to be on.
  if photographer_email = 'gilbertopro_admin@gmail.com' or photographer_plan in ('studio_pro_monthly', 'studio_pro_annual') then
    allowed_days := array[7, 14, 30, 90, 180, 365];
  elsif photographer_plan in ('basic_monthly', 'basic_annual') then
    allowed_days := array[7, 14];
  else
    allowed_days := array[7, 14, 30, 90];
  end if;

  if new.expiry_days is null or not (new.expiry_days = any(allowed_days)) then
    raise exception 'expiry_days % is not permitted for this plan (allowed: %)', new.expiry_days, allowed_days
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;
