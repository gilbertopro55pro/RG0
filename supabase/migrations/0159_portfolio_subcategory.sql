-- Sub-tabs inside a portfolio tab (owner, 2026-10-10): e.g. tab "חתונה" with sub-tabs "הכנות",
-- "ריקודים". A photo's tab stays portfolio_category; its sub-tab within that tab is this. The tab
-- shows all its photos, a sub-tab only its own.
alter table public.gallery_photos
  add column if not exists portfolio_subcategory text;

-- A sub-tab only exists inside its tab, so it goes with it: when the photo leaves the portfolio
-- or its tab, or its tab changes without a sub-tab being set in the same update. This keeps every
-- existing writer (which only knows portfolio_category) consistent without changing it.
create or replace function public.gallery_photos_portfolio_subcategory_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.portfolio_subcategory is not null then
    new.portfolio_subcategory := nullif(btrim(new.portfolio_subcategory), '');
  end if;
  if new.portfolio_subcategory is not null and (not coalesce(new.in_portfolio, false) or new.portfolio_category is null) then
    new.portfolio_subcategory := null;
  elsif tg_op = 'UPDATE'
    and new.portfolio_category is distinct from old.portfolio_category
    and new.portfolio_subcategory is not distinct from old.portfolio_subcategory then
    new.portfolio_subcategory := null;
  end if;
  return new;
end;
$$;

drop trigger if exists gallery_photos_portfolio_subcategory_guard on public.gallery_photos;
create trigger gallery_photos_portfolio_subcategory_guard
  before insert or update of in_portfolio, portfolio_category, portfolio_subcategory on public.gallery_photos
  for each row execute function public.gallery_photos_portfolio_subcategory_guard();
