-- Stage-B album proofing: a focal point per photo-in-spread (percentage of the image, 0=left/top,
-- 100=right/bottom) so the cover-crop shown in the proofing view and the exported PDF can be
-- aimed at what actually matters in the shot instead of always defaulting to dead-center.
alter table public.gallery_album_spreads
  add column focal_x_1 numeric not null default 50 check (focal_x_1 between 0 and 100),
  add column focal_y_1 numeric not null default 50 check (focal_y_1 between 0 and 100),
  add column focal_x_2 numeric not null default 50 check (focal_x_2 between 0 and 100),
  add column focal_y_2 numeric not null default 50 check (focal_y_2 between 0 and 100);
