-- Connecting a Meta ad account to campaign tracking (owner, 2026-10-14; admin only for now,
-- lib/metaAds.ts, api/meta/*). The photographer signs in with Facebook once, picks the ad account,
-- and each campaign's monthly spend, impressions and clicks are synced into ad_spend.

-- The access token is a secret: no policy at all, only the server (service role) reads or writes it.
create table if not exists public.meta_ad_connections (
  photographer_id uuid primary key references public.photographers(id) on delete cascade,
  access_token text not null,
  token_expires_at timestamptz,
  -- The chosen ad account ("act_<id>") and the accounts the sign-in gave access to, to choose from.
  ad_account_id text,
  ad_account_name text,
  currency text,
  ad_accounts jsonb not null default '[]'::jsonb,
  connected_at timestamptz not null default now(),
  last_sync_at timestamptz,
  last_error text
);
alter table public.meta_ad_connections enable row level security;

-- Where a spend row came from: typed in by hand, or synced from Meta (which also brings impressions
-- and clicks). A synced row replaces a hand-typed one for the same campaign and month.
alter table public.ad_spend
  add column if not exists source text not null default 'manual' check (source in ('manual', 'meta')),
  add column if not exists impressions integer,
  add column if not exists clicks integer;
