-- Backs the event pricing calculator (dashboard tool): a photographer configures their hourly
-- shooting rate and a list of supplier costs once in Settings, then the calculator multiplies/sums
-- these against a specific job's hours and chosen suppliers. No separate table for suppliers since
-- they're never queried independently of the photographer who owns them and are always read/written
-- as one whole list — same reasoning as price_quotes.items.
alter table public.photographers add column hourly_shoot_rate numeric(10, 2) not null default 0;
alter table public.photographers add column pricing_suppliers jsonb not null default '[]'::jsonb;
