-- Intake assistant (עוזר פניות), phase 1: a web chat on the photographer's public link that
-- collects the event details (never prices) and hands a lead to the photographer.
-- Reuses bot_conversations (built earlier for the never-enabled WhatsApp bot).

alter table bot_conversations
  add column if not exists channel text not null default 'whatsapp',
  add column if not exists session_token uuid not null default gen_random_uuid(),
  add column if not exists client_turns integer not null default 0,
  add column if not exists completed_at timestamptz;
alter table bot_conversations alter column client_phone drop not null;
create unique index if not exists bot_conversations_session_token_key on bot_conversations (session_token);
create index if not exists bot_conversations_photographer_created_idx on bot_conversations (photographer_id, created_at);

alter table leads
  add column if not exists source text not null default 'manual',
  add column if not exists bot_conversation_id uuid references bot_conversations(id) on delete set null,
  add column if not exists details jsonb,
  add column if not exists needs_details boolean not null default false;

alter table photographers
  add column if not exists intake_bot_enabled boolean not null default false,
  add column if not exists intake_bot_faq jsonb not null default '[]'::jsonb,
  add column if not exists intake_bot_reply_hours integer not null default 24,
  add column if not exists intake_bot_extra_question text,
  add column if not exists intake_chat_token uuid not null default gen_random_uuid();
create unique index if not exists photographers_intake_chat_token_key on photographers (intake_chat_token);
