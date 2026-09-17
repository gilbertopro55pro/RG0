-- Focal point (as a percentage of the cover photo, 0-100 on each axis) for the gallery's cover
-- banner — lets the photographer recenter which part of the photo stays visible once it's cropped
-- to the banner's fixed aspect ratio (see coverAspectRatio in src/lib/galleryTheme.ts), instead of
-- always cropping to dead-center. Defaults to 50/50 (center) so every existing gallery renders
-- exactly as it already does until a photographer explicitly moves the focal point.
alter table galleries
  add column if not exists cover_focal_x numeric not null default 50,
  add column if not exists cover_focal_y numeric not null default 50;
