-- Free-text instructions from the photographer to the print house (paper, finish, quantity...),
-- typed in the "שליחה לבית דפוס" sheet and included in the email sent once the files are ready.
alter table gallery_album_export_jobs add column if not exists send_notes text;
