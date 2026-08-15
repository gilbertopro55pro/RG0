-- Lets a photographer pick which document-issuing service they use, instead of Finbot being the
-- only option. The credential shape differs per provider (Finbot: one secret key, already on
-- `finbot_api_key`; Green Invoice: an id+secret pair used to mint a short-lived JWT) so each gets
-- its own columns rather than a generic key-value blob — keeps `issueDocument()`'s dispatcher
-- simple (read exactly the columns the selected provider needs).
alter table public.photographers
  add column invoice_provider text not null default 'finbot' check (invoice_provider in ('finbot', 'green_invoice')),
  add column green_invoice_api_id text,
  add column green_invoice_api_secret text;
