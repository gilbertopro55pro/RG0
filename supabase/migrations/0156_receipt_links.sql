-- Short, friendly links to issued receipts for WhatsApp messages (owner, 2026-10-08): instead of
-- the invoicing provider's long URL, myframeflow.com/r/<token>. One row per receipt, so a link
-- sent for an earlier receipt keeps showing that receipt. Read only server-side (service role)
-- by the public /r/<token> route; written by the issue-document route after its own auth check.
create table if not exists receipt_links (
  token text primary key,
  photographer_id uuid not null references photographers(id) on delete cascade,
  event_id uuid references events(id) on delete cascade,
  document_url text not null,
  created_at timestamptz not null default now()
);
alter table receipt_links enable row level security;
-- No policies: only the service role touches this table.
