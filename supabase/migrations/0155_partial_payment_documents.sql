-- Receipts on partial payments (owner, 2026-10-08): a receipt can be issued for money received so
-- far, then another for whatever comes in later. *_documented_amount is how much of the leg is
-- already covered by issued receipts, so the next one is for the difference only and the same
-- money is never receipted twice. *_document_url keeps the latest receipt.
alter table event_payments
  add column if not exists deposit_documented_amount numeric,
  add column if not exists balance_documented_amount numeric;

-- Until now a receipt was only issued once a leg was fully paid, so an existing one covers it all.
update event_payments set deposit_documented_amount = deposit_amount where deposit_document_url is not null and deposit_documented_amount is null;
update event_payments set balance_documented_amount = balance_amount where balance_document_url is not null and balance_documented_amount is null;
