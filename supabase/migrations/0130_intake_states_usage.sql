-- The intake assistant ends a conversation in state 'completed' — the original check (from the
-- never-enabled WhatsApp bot) didn't allow it, so the final save of a finished conversation failed.
alter table bot_conversations drop constraint if exists bot_conversations_state_check;
alter table bot_conversations add constraint bot_conversations_state_check
  check (state in ('collecting_info', 'completed', 'quoted', 'waitlisted', 'closed', 'abandoned'));

-- Token usage per conversation, summed across its model calls — the real cost per conversation.
alter table bot_conversations add column if not exists usage jsonb not null default '{}'::jsonb;
