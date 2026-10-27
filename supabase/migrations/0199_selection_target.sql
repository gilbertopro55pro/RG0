-- The photo count the client picks for the album, per event type (owner, 2026-10-27; lib/selectionTarget.ts).
-- photographers.photo_selection_targets: the photographer's own numbers, event type name -> count
-- (null = no target for that type); a type not in it takes the built-in default (wedding 200,
-- henna/bar/bat mitzvah/aliyah/brit 150, bar/bat mitzvah book 70). Set in Settings › "תמחור וחבילות צילום".
-- galleries.selection_target_celebrated_at: when the client's favorites first reached the count and
-- the confetti fell, so it falls once per gallery whatever the selection does afterwards. Written by
-- the server only (api/gallery/[token]/selection-target), on the client's own link.
alter table public.photographers
  add column if not exists photo_selection_targets jsonb not null default '{}'::jsonb;

alter table public.galleries
  add column if not exists selection_target_celebrated_at timestamptz;
