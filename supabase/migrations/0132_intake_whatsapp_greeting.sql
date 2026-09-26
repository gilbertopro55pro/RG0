-- The photographer's own WhatsApp Business greeting message (settings > automation). Null = the
-- default text from lib/intakeGreeting.ts.
alter table photographers add column if not exists intake_whatsapp_greeting text;
