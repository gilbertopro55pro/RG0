-- Auto album design: the style an album was designed in (clean / catalog / scribble / modern),
-- so "עיצוב מחדש" on one page redesigns it in the same style. Null = not auto-designed (the
-- redesign button then uses the clean style).
alter table public.gallery_albums add column if not exists auto_style text;
