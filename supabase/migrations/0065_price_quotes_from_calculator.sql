-- Supports building a price quote directly from the event pricing calculator: a custom display
-- name (separate from client_name, since the photographer may want to label it differently in
-- their own saved list) and the hours/rate actually used, so re-selecting this quote later in the
-- calculator's "event" mode can restore those two numbers exactly instead of guessing them back
-- out of the item rows.
alter table public.price_quotes add column quote_name text;
alter table public.price_quotes add column event_hours numeric(6, 2);
alter table public.price_quotes add column hourly_rate_used numeric(10, 2);
