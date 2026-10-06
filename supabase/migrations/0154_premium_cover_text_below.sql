-- The premium cover now honours "מיקום הכיתוב" (2026-10-06). Until now it ignored the setting and
-- always set the title low on the photo, while galleries carried the column default 'above'. So
-- that no live gallery changes, premium galleries on 'above' move to 'below' (= the look they
-- already have), and new galleries — premium by default since 0153 — start on 'below'.
update public.galleries set cover_text_position = 'below' where theme = 'premium' and cover_text_position = 'above';
alter table public.galleries alter column cover_text_position set default 'below';
