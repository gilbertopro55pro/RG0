-- Reusable starting points for the price-quote builder ("בונה הצעות מחיר") — a named preset of
-- item rows a photographer builds once in Settings (e.g. "חבילת חתונה בסיסית") and then loads as
-- the starting item set for a brand-new quote, adding supplier rows and notes on top from there.
-- Distinct from price_quotes itself: a template is never sent to a client and carries no
-- client/event/pricing-total fields, only the reusable item list.
create table public.price_quote_templates (
  id uuid primary key default gen_random_uuid(),
  photographer_id uuid not null references public.photographers(id) on delete cascade,
  name text not null,
  items jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create index price_quote_templates_photographer_id_idx on public.price_quote_templates(photographer_id);

alter table public.price_quote_templates enable row level security;

create policy "price_quote_templates_all_own"
  on public.price_quote_templates for all
  using (auth.uid() = photographer_id)
  with check (auth.uid() = photographer_id);
