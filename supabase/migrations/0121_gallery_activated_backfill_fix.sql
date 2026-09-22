-- 0120's backfill relied on title_customized=false to fingerprint ghost galleries created by the
-- removed auto-insert. That's only reliable for ghosts created after that column's semantics were
-- wired into createEvent.ts — older ghost rows (created before title_customized existed at all)
-- got backfilled to true by migration 0102's own column-add default, same as every other
-- pre-existing row, so 0120 missed them entirely and they kept showing on the galleries page.
--
-- Broader, more reliable signal for "nobody ever actually set this gallery up": still linked to an
-- event, never published, and zero photos ever uploaded to it. A gallery a photographer genuinely
-- created and is mid-editing would have at least one photo by the time anyone but the auto-insert
-- code touched it; a ghost never gets that far because nobody knew it existed.
update public.galleries
set activated = false
where event_id is not null
  and published = false
  and activated = true
  and not exists (select 1 from public.gallery_photos where gallery_photos.gallery_id = galleries.id);
