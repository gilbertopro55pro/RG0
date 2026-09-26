-- Where an intake conversation / lead came from (the chat link's ?src=, utm_source, fbclid, or the
-- WhatsApp channel), shown on the lead. And the photographer's own Meta Pixel for the chat page.
alter table bot_conversations add column if not exists referral_source text;
alter table leads add column if not exists referral_source text;
alter table photographers add column if not exists meta_pixel_id text;
