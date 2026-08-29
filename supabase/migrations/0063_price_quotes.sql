-- Standalone pricing proposals, independent of the leads/quotes flow (that one is a single flat
-- amount attached to a lead; this is a full itemized document a photographer can build and send to
-- ANY client — including one who never went through the leads pipeline). Saved to a list so a
-- photographer can reopen, resend, or reuse a past proposal instead of rebuilding it every time.
create table public.price_quotes (
  id uuid primary key default gen_random_uuid(),
  photographer_id uuid not null references public.photographers(id) on delete cascade,
  client_name text not null default '',
  client_phone text,
  client_email text,
  -- Array of {item, details, price} objects, one per row in the proposal's item table — no
  -- separate line-item table since a proposal's items only ever get read/written as a whole
  -- document, never queried or joined individually.
  items jsonb not null default '[]'::jsonb,
  subtotal numeric(10, 2) not null default 0,
  vat_amount numeric(10, 2) not null default 0,
  total numeric(10, 2) not null default 0,
  sent_at timestamptz,
  sent_via text check (sent_via in ('email', 'whatsapp')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index price_quotes_photographer_id_idx on public.price_quotes(photographer_id);

alter table public.price_quotes enable row level security;

create policy "price_quotes_all_own"
  on public.price_quotes for all
  using (auth.uid() = photographer_id)
  with check (auth.uid() = photographer_id);

-- No logo feature existed anywhere in the app before this — needed so the proposal PDF can show
-- the photographer's business logo top-left. Nullable: a proposal without one just omits it.
alter table public.photographers add column logo_storage_path text;
