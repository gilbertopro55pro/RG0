-- Stage-C album proofing: a free-form layout mode plus a text-layer that works on every spread
-- (preset layouts and free-form alike). `elements` holds an ordered array of photo/text elements
-- positioned as percentages of the page — used as the *entire* spread content when layout='custom',
-- and as a text-only overlay on top of the existing photo_id_1/photo_id_2 rendering otherwise.
-- Kept generic (jsonb) rather than new columns per field since element shape differs by type and
-- this only ever needs to round-trip as a whole array — there's no need to query into it.
alter table public.gallery_album_spreads
  drop constraint gallery_album_spreads_layout_check,
  add constraint gallery_album_spreads_layout_check check (layout in ('split', 'feature', 'stack', 'custom')),
  add column elements jsonb not null default '[]'::jsonb;

-- photo_id_1 is currently NOT NULL (every spread needs at least one anchor photo) — a pure-custom
-- spread built entirely from `elements` still satisfies this by keeping whichever photo was first
-- selected as photo_id_1 even though it isn't used for rendering in custom mode; simpler than
-- relaxing the constraint and having to handle a spread with zero photos everywhere else.
