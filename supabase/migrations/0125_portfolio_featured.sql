-- Lets a photographer hand-pick which portfolio photos appear in the public portfolio's hero strip
-- (the auto-advancing row of large photos at the top of /p/[slug]) instead of it sampling randomly
-- from the whole portfolio — capped at 25, per explicit product decision (2026-09-23). Only
-- meaningful while the photo is actually in the portfolio, so leaving the portfolio clears it.
alter table public.gallery_photos add column portfolio_featured boolean not null default false;

create index gallery_photos_portfolio_featured_idx on public.gallery_photos (photographer_id) where portfolio_featured = true;

create or replace function public.enforce_portfolio_featured()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  featured_count int;
begin
  -- A photo removed from the portfolio (PortfolioManagePanel's per-tab removal, or un-tagging it
  -- from a gallery) can't stay starred for a strip it's no longer eligible for.
  if not new.in_portfolio then
    new.portfolio_featured := false;
    return new;
  end if;

  if new.portfolio_featured and (tg_op = 'INSERT' or not old.portfolio_featured) then
    -- Serializes concurrent stars for the same photographer, so two quick taps can't both pass
    -- the count check below and land at 26.
    perform pg_advisory_xact_lock(hashtext('portfolio_featured:' || new.photographer_id::text));
    select count(*) into featured_count
    from public.gallery_photos
    where photographer_id = new.photographer_id and portfolio_featured and id <> new.id;
    if featured_count >= 25 then
      raise exception 'portfolio_featured_limit' using errcode = 'check_violation';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists gallery_photos_portfolio_featured on public.gallery_photos;
create trigger gallery_photos_portfolio_featured
  before insert or update of portfolio_featured, in_portfolio on public.gallery_photos
  for each row execute function public.enforce_portfolio_featured();
