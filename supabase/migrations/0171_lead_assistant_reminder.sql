-- "תזכורת" on the new-lead popup (owner, 2026-10-14): instead of "אחר כך" the photographer picks
-- 30 minutes, an hour or 3 hours, and the popup shows the lead again then, unless the lead was
-- handled by hand in the meantime (api/leads/assistant-new).
alter table public.leads add column if not exists assistant_remind_at timestamptz;

-- Like seeing the popup (migration 0144), setting or clearing the reminder is not activity on the
-- lead: it must not restart the archive clock or bring an archived lead back.
create or replace function public.leads_touch_activity()
 returns trigger
 language plpgsql
 set search_path to 'public'
as $function$
begin
  if new.archived_at is not null and old.archived_at is null then
    return new;
  end if;
  if (new.assistant_seen_at is distinct from old.assistant_seen_at
      or new.assistant_remind_at is distinct from old.assistant_remind_at)
     and (to_jsonb(new) - 'assistant_seen_at' - 'assistant_remind_at') = (to_jsonb(old) - 'assistant_seen_at' - 'assistant_remind_at') then
    return new;
  end if;
  new.archived_at := null;
  new.last_activity_at := now();
  return new;
end;
$function$;
