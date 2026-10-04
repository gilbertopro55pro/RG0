-- UI languages, phase 2 (2026-10-04): the language a client sees on their pages (quote, contract,
-- portal, gallery, chat). Null = Hebrew. Set by the photographer on the lead/event, or from the
-- chat when the assistant creates the lead. Admin account only for now (enforced in code).
alter table public.leads add column if not exists client_lang text
  check (client_lang is null or client_lang in ('he', 'en', 'ru'));
alter table public.events add column if not exists client_lang text
  check (client_lang is null or client_lang in ('he', 'en', 'ru'));
