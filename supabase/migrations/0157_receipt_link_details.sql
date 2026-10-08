-- The receipt's short link opens a branded page (owner, 2026-10-08): the studio's logo and name,
-- a greeting to the client and the amount, and buttons to view or download the PDF. Saved with
-- the link when the receipt is issued; null on links made before this (the page then says less).
alter table receipt_links add column if not exists amount numeric;
alter table receipt_links add column if not exists customer_name text;
