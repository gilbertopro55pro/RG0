-- Closes the "store indefinitely" loophole opened by migration 0032 (expiry_months null = never
-- expires). New galleries now pick a bounded retention window from a closed, plan-gated set —
-- see GALLERY_EXPIRY_OPTIONS_BY_TIER in src/lib/stages.ts for the app-side source of truth this
-- mirrors. expiry_months stays untouched (still used to label pre-existing galleries); expiry_days
-- is the new field going forward, in days rather than months because "week" and "14 days" aren't
-- whole months.
--
-- Existing galleries are intentionally left alone: the trigger below only validates on INSERT, or
-- on UPDATE when expiry_days is actually being changed. A photographer saving an unrelated field
-- (title, cover photo, ...) on an old gallery that already has expiry_days = null does not get
-- rejected — they're only pulled into the new capped system if they deliberately pick a new
-- retention value themselves.
alter table public.galleries add column expiry_days int;

-- Backfill for continuity (approximate: 1 month ~= 30 days). Rows that were already "unlimited"
-- (expiry_months null) stay null here too — still grandfathered, not retroactively capped.
update public.galleries set expiry_days = expiry_months * 30 where expiry_months is not null;

alter table public.galleries add constraint galleries_expiry_days_check
  check (expiry_days is null or expiry_days in (7, 14, 30, 90, 180));

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

drop trigger if exists gallery_expiry_by_plan on public.galleries;
create trigger gallery_expiry_by_plan
  before insert or update on public.galleries
  for each row execute function public.enforce_gallery_expiry_by_plan();

-- Backs the "storage used" stat in Settings — summed server-side (not fetched row-by-row) so it
-- stays cheap regardless of how many photos/videos a photographer has accumulated.
create or replace function public.photographer_storage_bytes(p_photographer_id uuid)
returns bigint
language sql
stable
security definer
set search_path = public
as $$
  select
    coalesce((
      select sum(gp.file_size_bytes) from public.gallery_photos gp
      join public.galleries g on g.id = gp.gallery_id
      where g.photographer_id = p_photographer_id
    ), 0)
    +
    coalesce((
      select sum(gv.file_size_bytes) from public.gallery_videos gv
      join public.galleries g on g.id = gv.gallery_id
      where g.photographer_id = p_photographer_id
    ), 0);
$$;
