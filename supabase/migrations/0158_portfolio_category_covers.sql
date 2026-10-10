-- The cover photo of each tab on the public portfolio (owner, 2026-10-10): the photographer picks
-- it in Settings › פורטפוליו › ניהול הפורטפוליו. Maps a tab name (portfolio_category) to a
-- gallery_photos id. A tab with no entry, or whose chosen photo left that tab, falls back to its
-- newest photo (src/app/p/[slug]/page.tsx).
alter table public.photographers
  add column if not exists portfolio_category_covers jsonb not null default '{}'::jsonb;
