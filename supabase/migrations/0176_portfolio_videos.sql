-- Videos in the public portfolio (owner, 2026-10-16): on פרו and פרו+, up to 400MB a file. They
-- are uploaded straight to the portfolio, into the photographer's hidden portfolio gallery
-- (galleries.is_portfolio_only, the same one directly uploaded portfolio photos live in), and
-- tagged with a tab and a sub-tab like portfolio photos (a dragged folder becomes a tab, its
-- sub-folders sub-tabs). The public page reads them with the service role (lib/portfolio.ts).

alter table public.gallery_videos
  add column if not exists in_portfolio boolean not null default false,
  add column if not exists portfolio_category text,
  add column if not exists portfolio_subcategory text;

create index if not exists gallery_videos_portfolio_idx on public.gallery_videos (photographer_id) where in_portfolio;

-- The plan gate (migration 0122) learns the portfolio: a video in the portfolio gallery is up to
-- 400MB on פרו and פרו+ (a client gallery's video stays 300MB / 500MB). A portfolio video must be
-- in the portfolio gallery, and a sub-tab needs a tab.
create or replace function public.enforce_gallery_video_by_plan()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  photographer_plan text;
  photographer_email text;
  portfolio_gallery boolean;
  max_bytes bigint;
begin
  select plan, email into photographer_plan, photographer_email
  from public.photographers where id = new.photographer_id;

  select coalesce(is_portfolio_only, false) into portfolio_gallery
  from public.galleries where id = new.gallery_id;

  if new.in_portfolio and not coalesce(portfolio_gallery, false) then
    raise exception 'portfolio_video_wrong_gallery' using errcode = 'check_violation';
  end if;
  if new.portfolio_category is null then
    new.portfolio_subcategory := null;
  end if;

  if coalesce(photographer_email, '') <> 'gilbertopro_admin@gmail.com' and photographer_plan in ('basic_monthly', 'basic_annual') then
    raise exception 'video_not_allowed_for_plan' using errcode = 'check_violation';
  end if;

  if coalesce(portfolio_gallery, false) then
    max_bytes := 400 * 1024 * 1024;
  elsif photographer_email = 'gilbertopro_admin@gmail.com' or photographer_plan in ('studio_pro_monthly', 'studio_pro_annual') then
    max_bytes := 500 * 1024 * 1024;
  else
    max_bytes := 300 * 1024 * 1024;
  end if;

  if new.file_size_bytes > max_bytes then
    raise exception 'video_too_large_for_plan' using errcode = 'check_violation';
  end if;

  return new;
end;
$$;
