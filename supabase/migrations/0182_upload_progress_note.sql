-- Why a browser upload stopped, for diagnosis (owner, 2026-10-17: a folder dragged into a gallery
-- failed on every photo, on a Mac, and nothing on the server said why). When an upload stops
-- because every file failed from the start (lib/galleryUploads.ts, HALT_AFTER), the uploading tab
-- writes the reason, what the browser said when the file was read, and the browser, here.
alter table public.upload_progress add column if not exists note text;
