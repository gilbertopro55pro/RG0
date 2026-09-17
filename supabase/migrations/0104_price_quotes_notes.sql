-- Free-text notes/comments on a price quote — shown on the generated PDF alongside the item
-- table (see priceQuotePdf.ts), distinct from a line item's own "פרטים" field which is scoped to
-- that one row. Added for the calculator-based quote builder (EventPricingCalculator.tsx) first,
-- per explicit request — same column is available to the manual builder (PriceQuotesSettings.tsx)
-- too if that surface picks it up later.
alter table public.price_quotes add column if not exists notes text;
