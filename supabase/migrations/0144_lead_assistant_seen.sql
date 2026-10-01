-- When the photographer saw the "new lead from the assistant" popup (owner, 2026-10-01): every
-- lead from the intake assistant pops up on any screen of the app until it's seen once.
alter table public.leads add column if not exists assistant_seen_at timestamptz;

-- Seeing the popup is not activity on the lead: it must not restart the archive clock or bring an
-- archived lead back (lib/leadRetention.ts, migration 0141).
create or replace function public.leads_touch_activity()
 returns trigger
 language plpgsql
as $function$
begin
  if new.archived_at is not null and old.archived_at is null then
    return new;
  end if;
  if new.assistant_seen_at is distinct from old.assistant_seen_at
     and (to_jsonb(new) - 'assistant_seen_at') = (to_jsonb(old) - 'assistant_seen_at') then
    return new;
  end if;
  new.archived_at := null;
  new.last_activity_at := now();
  return new;
end;
$function$;

-- Leads that already existed count as seen, so the popup starts with new ones only.
update public.leads set assistant_seen_at = now() where source = 'assistant' and assistant_seen_at is null;
