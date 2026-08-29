-- Israeli business registration number (ח.פ / עוסק מורשה/פטור number), shown on price-quote PDFs
-- next to the business name under the logo. Free text (not numeric-only) since formats vary
-- (leading zeros, dashes) and this is never used for lookups, only printed.
alter table public.photographers add column business_id text;
