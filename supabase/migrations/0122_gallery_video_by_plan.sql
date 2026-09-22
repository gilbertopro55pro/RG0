-- Gallery video uploads are a paid-tier feature with a per-file size cap by tier (mirrors
-- VIDEO_MAX_BYTES_BY_TIER in src/lib/stages.ts): פרו (standard) up to 300MB, פרו+ (studio_pro) up
-- to 500MB, entry-level (basic) not at all. The UI already hides/limits it — this is the real
-- enforcement, same pattern as enforce_gallery_expiry_by_plan (migration 0116). Insert-only:
-- videos a photographer already has (uploaded before a downgrade, or before this cap) stay intact.
create or replace function public.enforce_gallery_video_by_plan()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  photographer_plan text;
  photographer_email text;
  max_bytes bigint;
begin
  select plan, email into photographer_plan, photographer_email
  from public.photographers where id = new.photographer_id;

  if photographer_email = 'gilbertopro_admin@gmail.com' or photographer_plan in ('studio_pro_monthly', 'studio_pro_annual') then
    max_bytes := 500 * 1024 * 1024;
  elsif photographer_plan in ('basic_monthly', 'basic_annual') then
    raise exception 'video_not_allowed_for_plan' using errcode = 'check_violation';
  else
    max_bytes := 300 * 1024 * 1024;
  end if;

  if new.file_size_bytes > max_bytes then
    raise exception 'video_too_large_for_plan' using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

drop trigger if exists gallery_videos_enforce_plan on public.gallery_videos;
create trigger gallery_videos_enforce_plan
  before insert on public.gallery_videos
  for each row execute function public.enforce_gallery_video_by_plan();
