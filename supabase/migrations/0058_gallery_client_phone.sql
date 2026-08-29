-- Optional client phone number for the pre-deletion reminder, sent via WhatsApp alongside the
-- existing email reminder (client_email / reminder_sent_at, added in 0032/0033). Kept as its own
-- dedupe column (not reusing reminder_sent_at) since email and WhatsApp are independent channels —
-- a photographer might set one, the other, both, or neither.
alter table galleries add column if not exists client_phone text;
alter table galleries add column if not exists whatsapp_reminder_sent_at timestamptz;
