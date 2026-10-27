-- The album selection (owner, 2026-10-27; lib/albumSelection.ts): inside the favorites view the
-- photographer narrows the client's favorites down for the album. galleries.album_picks is the
-- draft (saved as they tap), album_selection the confirmed selection the album tools offer (null =
-- none, the favorites are offered), album_selection_at when it was confirmed. On the gallery row,
-- not on the photos, so the client's page (which gets the photo rows) never sees them.
-- gallery_album_spreads.marked_frames: the frames a changed selection gave a new photo or left
-- empty, shown with a red dot in the album preview and the editor until that page is saved there.
-- Its own column, never part of the elements, so no export draws it.
alter table public.galleries
  add column if not exists album_picks uuid[] not null default '{}',
  add column if not exists album_selection uuid[],
  add column if not exists album_selection_at timestamptz;

alter table public.gallery_album_spreads
  add column if not exists marked_frames text[] not null default '{}';
