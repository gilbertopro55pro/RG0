-- Background photo (gallery_album_spreads.background_photo_id) previously only supported
-- opacity/blur — no zoom, unlike a regular photo element. Per explicit request: "תמונת רקע - תאפשר
-- ביצוע זום כמו בתמונה רגילה". 100 = no zoom (matches the same convention AlbumPhotoElement.zoom
-- already uses), so existing rows default correctly with no migration of existing data needed.
alter table public.gallery_album_spreads add column background_zoom int not null default 100;
