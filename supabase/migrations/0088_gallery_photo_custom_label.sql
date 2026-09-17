-- Free-text label a CLIENT can attach to a photo (e.g. "קנבס", "בלוק זכוכית") via the diamond icon
-- next to the existing favorite heart — lets the client tell the photographer what they want done
-- with a specific favorited photo, and lets them filter their own favorites list by whatever
-- labels they've used. Set/cleared entirely from the client-facing gallery, never the photographer
-- side, so no default beyond null (no label) is needed.
alter table gallery_photos
  add column if not exists custom_label text;
