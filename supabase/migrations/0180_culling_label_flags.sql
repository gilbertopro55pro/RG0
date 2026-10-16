-- Photo culling labels, two more problems (owner, 2026-10-16): "לא מחמיא" (an unflattering
-- moment: mid-word, a grimace, a bad angle) and "מבט לא למצלמה" (a posed photo where someone isn't
-- looking at the camera). A photo can now have several problems at once, so these are flags beside
-- `label`, which keeps meaning focus and eyes (ok / blurry / eyes_closed / both / skip) as before.
-- labeled_v: 2 for a label saved with the new options on screen; null for the ones saved before,
-- which were never asked about the new problems (the engine test counts the new ones only on v2).

alter table public.culling_labels
  add column if not exists unflattering boolean not null default false,
  add column if not exists not_looking boolean not null default false,
  add column if not exists labeled_v smallint;
