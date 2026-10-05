-- New galleries open in the flagship "premium" theme (full-screen cover, chapter titles, sticky
-- action bar; see GALLERY_THEMES in src/lib/galleryTheme.ts). Only the column default changes:
-- existing galleries keep the theme they have, and the photographer can switch either way in the
-- gallery's design settings.
alter table public.galleries alter column theme set default 'premium';
