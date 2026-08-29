-- A public, marketing-facing showcase page per photographer, built from photos they already
-- have in the system — opt-in (portfolio_enabled) and photo-by-photo curated (in_portfolio),
-- so nothing from a private client gallery appears publicly unless the photographer explicitly
-- adds it. portfolio_slug is a human-chosen, URL-safe handle (e.g. "roi-gilberto") rather than
-- an opaque token, since this link is meant to be shared/remembered/put on a business card.
alter table public.photographers add column portfolio_enabled boolean not null default false;
alter table public.photographers add column portfolio_slug text unique;
alter table public.photographers add column portfolio_bio text;

alter table public.gallery_photos add column in_portfolio boolean not null default false;

-- Slugs are looked up publicly (unauthenticated) by exact match — an index keeps that fast as
-- the photographer count grows. Partial (only non-null slugs) since most rows will never set one.
create index gallery_photos_in_portfolio_idx on public.gallery_photos (photographer_id) where in_portfolio = true;
create index photographers_portfolio_slug_idx on public.photographers (portfolio_slug) where portfolio_slug is not null;
