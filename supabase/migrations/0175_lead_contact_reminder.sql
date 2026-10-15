-- "תזכורת ליצירת קשר" (owner, 2026-10-15): choosing "יצרתי קשר" on a lead offers a reminder at a
-- date and time of the photographer's choice. When it falls due the lead pops up in the app
-- (components/ContactReminderPopup.tsx) and a phone notification goes out once
-- (contact_remind_pushed_at, api/cron/lead-reminders).
alter table public.leads
  add column if not exists contact_remind_at timestamptz,
  add column if not exists contact_remind_pushed_at timestamptz;

create index if not exists leads_contact_remind_at_idx on public.leads (contact_remind_at) where contact_remind_at is not null;

-- Like the assistant popup's fields (migrations 0144, 0171, 0172), setting or clearing the reminder
-- is not activity on the lead: it must not restart the archive clock or bring an archived lead back.
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
      or new.assistant_remind_at is distinct from old.assistant_remind_at
      or new.assistant_remind_pushed_at is distinct from old.assistant_remind_pushed_at
      or new.contact_remind_at is distinct from old.contact_remind_at
      or new.contact_remind_pushed_at is distinct from old.contact_remind_pushed_at)
     and (to_jsonb(new) - 'assistant_seen_at' - 'assistant_remind_at' - 'assistant_remind_pushed_at' - 'contact_remind_at' - 'contact_remind_pushed_at')
       = (to_jsonb(old) - 'assistant_seen_at' - 'assistant_remind_at' - 'assistant_remind_pushed_at' - 'contact_remind_at' - 'contact_remind_pushed_at') then
    return new;
  end if;
  new.archived_at := null;
  new.last_activity_at := now();
  return new;
end;
$function$;
