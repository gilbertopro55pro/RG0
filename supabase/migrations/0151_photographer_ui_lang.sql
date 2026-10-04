-- The photographer's own UI language (2026-10-04), so server-sent emails and push notifications to
-- the photographer go out in it. Null = Hebrew. Written by /api/ui-language and at signup; the
-- per-device ui_lang cookie still decides the screens themselves.
alter table public.photographers add column if not exists ui_lang text
  check (ui_lang is null or ui_lang in ('he', 'en', 'ru'));
