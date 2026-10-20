-- A still frame of each portfolio video (owner 2026-10-20): the cover on a link's preview card for a
-- tab that only has videos. Captured in the photographer's browser, re-encoded and stored by the
-- server in the public previews bucket, under the video's own gallery.
alter table public.gallery_videos add column if not exists poster_path text;

alter table public.gallery_videos drop constraint if exists gallery_videos_poster_path_check;
alter table public.gallery_videos add constraint gallery_videos_poster_path_check
  check (poster_path is null or (poster_path like ('previews/' || gallery_id::text || '/%.webp') and poster_path not like '%/../%'));
