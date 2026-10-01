-- The full quote sent from the quote builder, kept on the lead (owner, 2026-10-01): line items,
-- totals, VAT, notes, event details and hours. The client's quote page (/quotes/<token>) shows it
-- designed like the PDF, and the questionnaire after approval starts from its date, hours and place.
alter table public.leads add column if not exists quote_details jsonb;
