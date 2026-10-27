-- The client changes the album design in the gallery (owner, 2026-10-27): swaps photos within a page
-- or between pages, and a page whose new photo doesn't fit its frame is redesigned ("עיצוב מחדש",
-- with a way back up to 3 designs). Written only by the server (api/gallery/[token]/album/edit,
-- service role) after checking the client's gallery link and that the album is "sent".
--   client_original:  the page as the photographer sent it, before the client's first change
--                     ({ elements, background_photo_id, marked_frames }), for "undo all my changes";
--                     null while the client hasn't changed the page.
--   client_history:   up to 3 earlier designs of the page, the latest last ([{ elements, background_photo_id }]),
--                     for "back to the previous design".
--   client_edited_at: when the client last changed the page; null = as the photographer sent it.
-- Sending the album to the client again starts over (the route clears all three).
alter table public.gallery_album_spreads
  add column if not exists client_original jsonb,
  add column if not exists client_history jsonb,
  add column if not exists client_edited_at timestamptz;
