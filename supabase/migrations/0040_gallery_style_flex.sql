-- Per-gallery overrides that decouple font/layout from the theme preset, plus a curated
-- slideshow photo list. Null overrides fall back to the theme's own defaults.
alter table galleries
  add column title_font_override text,
  add column grid_style_override text,
  add column slideshow_photo_ids uuid[] not null default '{}';
