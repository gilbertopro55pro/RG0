-- How far the print-safe green guide sits from every page edge, in centimeters — previously a
-- hardcoded 0.5cm for every album regardless of its physical size. Now set once per album at
-- creation time (manually or via a size preset) and used both to draw the guide and to fit
-- auto-generated layouts (wizard styles, saved templates, the built-in template bank) inside it.
alter table public.gallery_albums
  add column safe_margin_cm numeric not null default 0.5;
