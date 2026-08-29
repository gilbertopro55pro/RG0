-- The price-quote PDF and its WhatsApp send message now show the event this quote is for (type,
-- date, location, and the work hours) — previously only the calculator's live preview had this
-- (passed straight through from its own form, never persisted), so a SAVED and later-sent quote
-- had no event context at all. Storing it directly on the quote itself makes it available however
-- the quote was built (the plain manual builder or the calculator) and whenever it's sent.
alter table public.price_quotes add column event_type text;
alter table public.price_quotes add column event_date date;
alter table public.price_quotes add column event_location text;
alter table public.price_quotes add column work_start_time time;
alter table public.price_quotes add column work_end_time time;
