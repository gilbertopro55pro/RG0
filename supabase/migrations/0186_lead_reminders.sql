-- "שליחת תזכורת" on the leads page (owner, 2026-10-19): two days after the quote was sent or the
-- lead was marked "יצרתי קשר", a lead gets a button to send the client a reminder (WhatsApp, SMS,
-- email or copied text). contacted_at is when the status last became 'contacted' (set by the
-- trigger below, whichever route changes it); reminder_sent_at / reminder_count record the
-- reminders sent (api/leads/[id]/reminder), and the button waits another two days after each one.
alter table public.leads
  add column if not exists contacted_at timestamptz,
  add column if not exists reminder_sent_at timestamptz,
  add column if not exists reminder_count integer not null default 0;

create or replace function public.leads_track_contacted()
 returns trigger
 language plpgsql
 set search_path to 'public'
as $function$
begin
  if new.status = 'contacted' and (tg_op = 'INSERT' or old.status is distinct from 'contacted') then
    new.contacted_at := now();
  end if;
  return new;
end;
$function$;

create or replace trigger leads_track_contacted
  before insert or update of status on public.leads
  for each row execute function public.leads_track_contacted();

-- Leads already marked "יצרתי קשר": the last change on the lead is the closest known time (never
-- earlier than the real one, so no button shows too early). The activity trigger is off for the
-- backfill, so it doesn't reset the leads' retention clock or bring archived ones back.
alter table public.leads disable trigger leads_touch_activity;
update public.leads set contacted_at = last_activity_at where status = 'contacted' and contacted_at is null;
alter table public.leads enable trigger leads_touch_activity;
