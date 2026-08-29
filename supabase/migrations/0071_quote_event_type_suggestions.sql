-- The price-quote calculator's "event type" field remembers whatever a photographer types beyond
-- the built-in suggestions (see EventPricingCalculator.tsx), most-recent first, and lets them
-- clear it. Deliberately NOT the existing event_types table: that one is also the foreign key
-- target for package_prices, so deleting a row there cascades into real configured pricing —
-- wiring this lightweight, throwaway suggestion list into it would make "clear my recent event
-- type guesses" capable of silently deleting a photographer's actual price list. Same
-- never-queried-independently reasoning as pricing_suppliers (migration 0064).
alter table public.photographers add column quote_event_type_suggestions jsonb not null default '[]'::jsonb;
