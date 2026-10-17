-- Quote history (owner, 2026-10-17): every quote that goes out, one row each, for the "היסטוריה" tab
-- of the quote builder (download as PDF, send to the client on WhatsApp again). A lead keeps only its
-- latest quote (leads.quote_details) and idle leads are deleted after about four weeks
-- (lib/leadRetention.ts), so the history keeps its own copy: lead_id goes null when the lead is gone.
-- Rows are written by the server routes that send a quote (lib/quoteHistory.ts), as the photographer.
create table if not exists public.quote_history (
  id uuid primary key default gen_random_uuid(),
  photographer_id uuid not null references public.photographers(id) on delete cascade,
  lead_id uuid references public.leads(id) on delete set null,
  client_name text not null default '',
  client_phone text,
  client_lang text,
  -- The quote as sent (lib/leadQuote.ts LeadQuoteDetails): items, totals, discount, event, notes.
  details jsonb not null,
  total numeric not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists quote_history_photographer_created on public.quote_history (photographer_id, created_at desc);

alter table public.quote_history enable row level security;

create policy quote_history_read_own on public.quote_history
  for select using ((select auth.uid()) = photographer_id);

-- The lead a row points at must be the same photographer's (cross-studio rule, migration 0163).
create policy quote_history_insert_own on public.quote_history
  for insert with check (
    (select auth.uid()) = photographer_id
    and (lead_id is null or lead_id in (select id from public.leads where photographer_id = (select auth.uid())))
  );

-- A discount on a saved quote (lib/quoteDiscount.ts), so loading it back keeps it.
alter table public.price_quotes add column if not exists discount jsonb;

-- Start the history with what was already sent: each lead's latest quote from the builder, and the
-- saved quotes that aren't the same quote as one of those (same total and phone).
insert into public.quote_history (photographer_id, lead_id, client_name, client_phone, client_lang, details, total, created_at)
select
  l.photographer_id,
  l.id,
  coalesce(l.name, ''),
  l.phone,
  l.client_lang,
  l.quote_details,
  coalesce((l.quote_details->>'total')::numeric, l.quoted_amount, 0),
  coalesce((l.quote_details->>'createdAt')::timestamptz, l.quote_sent_at, l.created_at)
from public.leads l
where l.quote_details is not null and jsonb_typeof(l.quote_details->'items') = 'array';

insert into public.quote_history (photographer_id, lead_id, client_name, client_phone, client_lang, details, total, created_at)
select
  pq.photographer_id,
  null,
  pq.client_name,
  nullif(pq.client_phone, ''),
  null,
  jsonb_strip_nulls(jsonb_build_object(
    'items', pq.items,
    'subtotal', pq.subtotal,
    'vatAmount', pq.vat_amount,
    'total', pq.total,
    'showVat', pq.vat_amount > 0,
    'eventType', pq.event_type,
    'eventDate', pq.event_date::text,
    'eventLocation', pq.event_location,
    'startTime', to_char(pq.work_start_time, 'HH24:MI'),
    'endTime', to_char(pq.work_end_time, 'HH24:MI'),
    'notes', pq.notes,
    'createdAt', to_char(pq.created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
  )),
  pq.total,
  pq.created_at
from public.price_quotes pq
-- Saved from the builder after sending (it records the hours), or sent from Settings.
where (pq.event_hours is not null or pq.sent_at is not null)
  and not exists (
    select 1 from public.leads l
    where l.photographer_id = pq.photographer_id
      and l.quote_details is not null
      and abs(coalesce((l.quote_details->>'total')::numeric, 0) - pq.total) < 1
      and length(regexp_replace(coalesce(pq.client_phone, ''), '\D', '', 'g')) >= 8
      and regexp_replace(coalesce(l.phone, ''), '\D', '', 'g') like '%' || right(regexp_replace(pq.client_phone, '\D', '', 'g'), 8)
  );
