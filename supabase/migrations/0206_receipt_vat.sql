-- VAT on the dashboard (owner, 2026-11-04, "עדכון אדמין"): the total VAT of the receipts an עוסק
-- מורשה issued from the system.
--
-- `receipt_links` already has one row per receipt issued from an event (issue-document), with the
-- day and the amount. Each row now also keeps the tax status the receipt was issued under and the
-- VAT in it, so a photographer who started as עוסק פטור and moved to מורשה gets VAT only on the
-- receipts issued after the move, and a change of status later never rewrites what was issued.
-- The amount on a receipt is what the client paid, VAT included: VAT = amount × 18 / 118.
--
-- Written only by the server (issue-document → createReceiptLink, service role). The table has no
-- RLS policies, as before.

alter table public.receipt_links
  add column if not exists tax_status text check (tax_status in ('exempt', 'licensed')),
  add column if not exists vat_amount numeric(12, 2);

-- The receipts issued so far: under the photographer's status today. On 2026-11-04 one licensed
-- account had receipts here (4, all from October 2026); the owner was told this assumes they were
-- all issued as מורשה.
update public.receipt_links rl
set tax_status = p.business_tax_status,
    vat_amount = case
      when p.business_tax_status = 'licensed' and rl.amount is not null then round(rl.amount * 18 / 118, 2)
      else 0
    end
from public.photographers p
where p.id = rl.photographer_id
  and rl.tax_status is null;
