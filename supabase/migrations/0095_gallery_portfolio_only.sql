-- Lets a photographer upload photos straight into the public portfolio without going through a
-- client gallery first: they land in a single hidden, standalone gallery (event_id null, same
-- "standalone gallery" shape migration 0032 already supports) per photographer, flagged here so it
-- can be excluded from the regular /galleries list — it's just a storage container, never meant to
-- be opened, published, or seen as a real client gallery.
alter table public.galleries add column is_portfolio_only boolean not null default false;
