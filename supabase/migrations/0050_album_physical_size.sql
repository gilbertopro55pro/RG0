-- The physical print size of the album, in centimeters — drives the pixel dimensions used when
-- exporting pages to JPG/PSD at print resolution (JPG/PSD only; the PDF proof export stays at its
-- existing fixed on-screen size, since it's a layout proof, not a press file). Defaults to a
-- common landscape spread size so exports work immediately without the photographer having to
-- configure anything first.
alter table public.gallery_albums
  add column width_cm numeric not null default 30,
  add column height_cm numeric not null default 20;
