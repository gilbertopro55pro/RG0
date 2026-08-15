-- Each photographer connects their own Finbot account to issue real receipts/invoices to their
-- own clients — reusing the platform's single Finbot account would issue documents under the
-- platform's business identity, not the photographer's, which is simply the wrong document.
-- business_tax_status decides which Finbot document type is legal for that photographer to issue
-- (עוסק פטור can only issue a קבלה; עוסק מורשה issues a חשבונית מס/קבלה with VAT).
alter table public.photographers
  add column finbot_api_key text,
  add column business_tax_status text not null default 'exempt' check (business_tax_status in ('exempt', 'licensed'));

-- Client email lives on events (mirroring galleries.client_email) — needed to send the document,
-- and previously wasn't collected anywhere on the event itself.
alter table public.events
  add column client_email text;

-- Where the issued document ends up, per payment leg (mirrors the deposit/balance split already
-- used throughout event_payments).
alter table public.event_payments
  add column deposit_document_url text,
  add column balance_document_url text;
