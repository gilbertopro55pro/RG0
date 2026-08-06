create table public.package_prices (
  photographer_id uuid not null references public.photographers(id) on delete cascade,
  package text not null check (package in ('stills', 'stills_reel', 'stills_video', 'full', 'full_second')),
  price numeric(10, 2) not null default 0,
  primary key (photographer_id, package)
);

alter table public.package_prices enable row level security;

create policy "package_prices_all_own"
  on public.package_prices for all
  using (auth.uid() = photographer_id)
  with check (auth.uid() = photographer_id);

alter table public.photographers
  add column whatsapp_bot_enabled boolean not null default false;

create table public.bot_conversations (
  id uuid primary key default gen_random_uuid(),
  photographer_id uuid not null references public.photographers(id) on delete cascade,
  client_phone text not null,
  state text not null default 'collecting_info' check (
    state in ('collecting_info', 'quoted', 'waitlisted', 'closed', 'abandoned')
  ),
  collected jsonb not null default '{}'::jsonb,
  messages jsonb not null default '[]'::jsonb,
  lead_id uuid references public.leads(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (photographer_id, client_phone)
);

create index bot_conversations_photographer_id_idx on public.bot_conversations(photographer_id);

alter table public.bot_conversations enable row level security;

create policy "bot_conversations_all_own"
  on public.bot_conversations for all
  using (auth.uid() = photographer_id)
  with check (auth.uid() = photographer_id);
