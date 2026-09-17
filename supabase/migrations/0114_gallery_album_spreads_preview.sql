-- A real server-rendered JPEG snapshot of a spread, kept fresh by re-rendering it every time the
-- photographer enters or leaves the album editor for that page — distinct from the live CSS-based
-- preview the editor/thumbnail strip already show (which is always in sync since it's driven
-- directly from `elements`, but is a browser CSS approximation, not the same raster pipeline used
-- for the actual PDF/JPG/PSD export). preview_storage_path is a stable per-spread key in the
-- "galleries" R2 bucket (overwritten on every re-render, not versioned), so there is nothing to
-- garbage-collect on spread deletion beyond what already happens for the spread's other storage
-- objects. preview_updated_at lets a consumer show "last rendered" or invalidate a cached copy.
alter table public.gallery_album_spreads
  add column preview_storage_path text,
  add column preview_updated_at timestamptz;
