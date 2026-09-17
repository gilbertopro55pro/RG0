-- Extends gallery_album_export_jobs to also cover the "send to print house" flow (zip-then-email
-- instead of zip-then-download) with the exact same real background-progress system, instead of
-- that route's own separate client-side simulated timer. When set, processAlbumExportJob emails
-- a download link to this address once the job reaches 'ready' instead of the client downloading
-- the file itself.
alter table public.gallery_album_export_jobs
  add column send_to_email text;
