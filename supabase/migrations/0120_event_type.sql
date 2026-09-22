-- Free-text occasion type for an event (e.g. "עלייה לתורה"), shown alongside client_name as
-- "סוג האירוע - שם הלקוח" on the event card. Kept as its own nullable column (not folded into
-- client_name) so WhatsApp messages, contracts and the gallery title keep using the plain client
-- name. Null on every existing event — the card just falls back to client_name alone.
alter table public.events add column event_type text;
