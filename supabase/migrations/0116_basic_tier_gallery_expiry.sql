-- New entry-level "basic" tier (see STORAGE_CAP_BYTES_BY_TIER/GALLERY_EXPIRY_OPTIONS_BY_TIER in
-- src/lib/stages.ts). Same pattern as migration 0079's studio_pro rollout: widen the plan/
-- pending_plan check constraints to admit the two new plan keys, then mirror the tier's 14-day
-- gallery retention cap into the DB trigger migration 0084 introduced, so the real enforcement
-- doesn't just live client-side. studio_pro and everyone else's allowed windows are unchanged.
alter table public.photographers drop constraint photographers_plan_check;
alter table public.photographers add constraint photographers_plan_check
  check (plan in ('basic_monthly', 'basic_annual', 'monthly', 'annual', 'studio_pro_monthly', 'studio_pro_annual'));

alter table public.photographers drop constraint photographers_pending_plan_check;
alter table public.photographers add constraint photographers_pending_plan_check
  check (pending_plan in ('basic_monthly', 'basic_annual', 'monthly', 'annual', 'studio_pro_monthly', 'studio_pro_annual'));

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
    allowed_days := array[7, 14, 30, 90, 180];
  elsif photographer_plan in ('basic_monthly', 'basic_annual') then
    allowed_days := array[7, 14];
  else
    allowed_days := array[7, 14, 30];
  end if;

  if new.expiry_days is null or not (new.expiry_days = any(allowed_days)) then
    raise exception 'expiry_days % is not permitted for this plan (allowed: %)', new.expiry_days, allowed_days
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;
