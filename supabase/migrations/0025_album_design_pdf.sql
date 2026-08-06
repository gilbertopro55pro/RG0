alter table public.events
  add column album_design_pdf_path text,
  add column album_design_pdf_filename text;

-- Private bucket — the photographer's own browser client uploads the album design PDF here
-- (RLS below, scoped to their own uid as the top-level path folder), same pattern as the
-- `galleries` bucket. The client-facing WhatsApp message links to a short-lived signed URL
-- generated server-side, never a direct public URL.
insert into storage.buckets (id, name, public)
values ('album-designs', 'album-designs', false)
on conflict (id) do nothing;

create policy "album_design_storage_owner_all"
  on storage.objects for all
  using (bucket_id = 'album-designs' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'album-designs' and (storage.foldername(name))[1] = auth.uid()::text);
