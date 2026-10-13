-- Security fix (audit 2026-10-13): row policies checked only "photographer_id = auth.uid()" on
-- the new row, never that the row it points at (gallery, event, lead, package…) is the caller's
-- too. A signed-in photographer could add photos, folders, an album or videos to another studio's
-- gallery (gallery ids appear in public preview URLs), or point a lead at another studio's event
-- (the quote page then handed out that event's portal token). Each check now also requires the
-- parent to be the caller's, and file paths to sit under the caller's own prefix (the gallery
-- lifecycle cron deletes storage_path with the service role). Existing data was checked first:
-- no cross-studio links and no off-prefix paths. Server routes use the service role and are not
-- affected.
alter policy "gallery_photos_all_own" on public.gallery_photos with check (
  (select auth.uid()) = photographer_id
  and gallery_id in (select id from public.galleries where photographer_id = (select auth.uid()))
  and (folder_id is null or folder_id in (select id from public.gallery_folders where photographer_id = (select auth.uid())))
  and storage_path like (select auth.uid())::text || '/' || gallery_id::text || '/%'
  and (preview_storage_path is null or preview_storage_path like 'previews/' || gallery_id::text || '/%')
);
alter policy "gallery_videos_all_own" on public.gallery_videos with check (
  (select auth.uid()) = photographer_id
  and gallery_id in (select id from public.galleries where photographer_id = (select auth.uid()))
  and storage_path like (select auth.uid())::text || '/' || gallery_id::text || '/%'
);
alter policy "gallery_folders_all_own" on public.gallery_folders with check (
  (select auth.uid()) = photographer_id
  and gallery_id in (select id from public.galleries where photographer_id = (select auth.uid()))
);
alter policy "gallery_albums_owner_only" on public.gallery_albums with check (
  (select auth.uid()) = photographer_id
  and gallery_id in (select id from public.galleries where photographer_id = (select auth.uid()))
  and (cover_photo_id is null or cover_photo_id in (select id from public.gallery_photos where photographer_id = (select auth.uid())))
);
alter policy "galleries_all_own" on public.galleries with check (
  (select auth.uid()) = photographer_id
  and (event_id is null or event_id in (select id from public.events where photographer_id = (select auth.uid())))
  and (cover_photo_id is null or cover_photo_id in (select id from public.gallery_photos where photographer_id = (select auth.uid())))
);
alter policy "leads_all_own" on public.leads with check (
  (select auth.uid()) = photographer_id
  and (converted_event_id is null or converted_event_id in (select id from public.events where photographer_id = (select auth.uid())))
  and (bot_conversation_id is null or bot_conversation_id in (select id from public.bot_conversations where photographer_id = (select auth.uid())))
);
alter policy "bot_conversations_all_own" on public.bot_conversations with check (
  (select auth.uid()) = photographer_id
  and (lead_id is null or lead_id in (select id from public.leads where photographer_id = (select auth.uid())))
);
alter policy "waitlist_all_own" on public.waitlist with check (
  (select auth.uid()) = photographer_id
  and (lead_id is null or lead_id in (select id from public.leads where photographer_id = (select auth.uid())))
);
alter policy "custom_package_stages_all_own" on public.custom_package_stages with check (
  (select auth.uid()) = photographer_id
  and package_id in (select id from public.custom_packages where photographer_id = (select auth.uid()))
);
alter policy "package_prices_all_own" on public.package_prices with check (
  (select auth.uid()) = photographer_id
  and (event_type_id is null or event_type_id in (select id from public.event_types where photographer_id = (select auth.uid())))
  and (custom_package_id is null or custom_package_id in (select id from public.custom_packages where photographer_id = (select auth.uid())))
);
alter policy "custom_ornaments_owner_only" on public.custom_ornaments with check (
  (select auth.uid()) = photographer_id
  and (tab_id is null or tab_id in (select id from public.custom_ornament_tabs where photographer_id = (select auth.uid())))
);
alter policy "events_all_own" on public.events with check (
  (select auth.uid()) = photographer_id
  and (custom_package_id is null or custom_package_id in (select id from public.custom_packages where photographer_id = (select auth.uid())))
  and (contract_template_id is null or contract_template_id in (select id from public.contract_templates where photographer_id = (select auth.uid())))
);
