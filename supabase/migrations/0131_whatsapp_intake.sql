-- Intake assistant, phase 2: WhatsApp through the same engine (runIntakeTurn), admin only at first.

-- The Cloud API number that serves this photographer's intake bot. Inbound webhooks are routed by
-- metadata.phone_number_id, and the bot replies from the same number.
alter table photographers add column if not exists whatsapp_bot_phone_number_id text;
create unique index if not exists photographers_whatsapp_bot_phone_number_id_key
  on photographers (whatsapp_bot_phone_number_id) where whatsapp_bot_phone_number_id is not null;

-- One WhatsApp conversation per (photographer, client number). 'ignored' = the number wrote but the
-- bot must not answer (not from the ad, or a known contact); 'human' = the photographer replied by
-- hand, the bot stays out from then on.
alter table bot_conversations add column if not exists busy_until timestamptz;
alter table bot_conversations drop constraint if exists bot_conversations_state_check;
alter table bot_conversations add constraint bot_conversations_state_check
  check (state in ('collecting_info', 'completed', 'quoted', 'waitlisted', 'closed', 'abandoned', 'ignored', 'human'));
create unique index if not exists bot_conversations_whatsapp_client_key
  on bot_conversations (photographer_id, client_phone) where channel = 'whatsapp';

-- Inbound WhatsApp messages: dedupes Meta's webhook retries (primary key = WhatsApp message id) and
-- queues a burst of messages from one client so they get one reply.
create table if not exists whatsapp_inbound_messages (
  id text primary key,
  conversation_id uuid not null references bot_conversations(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now(),
  processed_at timestamptz
);
create index if not exists whatsapp_inbound_messages_pending_idx
  on whatsapp_inbound_messages (conversation_id, created_at) where processed_at is null;
alter table whatsapp_inbound_messages enable row level security;

-- Is this number already one of the photographer's contacts (client, lead, event, quote,
-- waitlist)? Compared on the last 9 digits so 050-..., +972-50-... and 97250... all match.
create or replace function whatsapp_known_contact(p_photographer uuid, p_phone text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  with t as (select right(regexp_replace(p_phone, '\D', '', 'g'), 9) as tail)
  select length((select tail from t)) = 9 and (
    exists (select 1 from events where photographer_id = p_photographer and right(regexp_replace(coalesce(client_phone, ''), '\D', '', 'g'), 9) = (select tail from t))
    or exists (select 1 from galleries where photographer_id = p_photographer and right(regexp_replace(coalesce(client_phone, ''), '\D', '', 'g'), 9) = (select tail from t))
    or exists (select 1 from leads where photographer_id = p_photographer and right(regexp_replace(coalesce(phone, ''), '\D', '', 'g'), 9) = (select tail from t))
    or exists (select 1 from price_quotes where photographer_id = p_photographer and right(regexp_replace(coalesce(client_phone, ''), '\D', '', 'g'), 9) = (select tail from t))
    or exists (select 1 from waitlist where photographer_id = p_photographer and right(regexp_replace(coalesce(client_phone, ''), '\D', '', 'g'), 9) = (select tail from t))
  );
$$;
revoke all on function whatsapp_known_contact(uuid, text) from public, anon, authenticated;
