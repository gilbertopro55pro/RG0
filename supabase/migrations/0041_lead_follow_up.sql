-- Extends the existing generic message scheduler to also cover leads, not just events — a
-- lead has no event_id until it converts, so event_id becomes nullable and lead_id is added
-- alongside it. sequence_step tracks which follow-up in the series a row is (1/2/3), used to
-- render progress and to build the message body from the right template.
alter table public.scheduled_messages
  alter column event_id drop not null,
  add column lead_id uuid references public.leads(id) on delete cascade,
  add column sequence_step int;

alter table public.scheduled_messages
  drop constraint scheduled_messages_kind_check,
  add constraint scheduled_messages_kind_check
    check (kind in ('review_request', 'payment_reminder', 'lead_follow_up'));

alter table public.scheduled_messages
  add constraint scheduled_messages_target_check
    check ((event_id is not null) <> (lead_id is not null));

create index scheduled_messages_lead_id_idx on public.scheduled_messages(lead_id);

drop policy "scheduled_messages_owner_only" on public.scheduled_messages;

create policy "scheduled_messages_owner_only"
  on public.scheduled_messages for all
  using (
    (event_id is not null and public.is_event_owner(event_id))
    or (lead_id is not null and exists (
      select 1 from public.leads l where l.id = lead_id and l.photographer_id = auth.uid()
    ))
  )
  with check (
    (event_id is not null and public.is_event_owner(event_id))
    or (lead_id is not null and exists (
      select 1 from public.leads l where l.id = lead_id and l.photographer_id = auth.uid()
    ))
  );

-- Per-photographer customizable follow-up message texts (3 steps) — sensible Hebrew defaults
-- so the feature works immediately without forcing a settings visit first.
alter table public.photographers
  add column lead_follow_up_enabled boolean not null default true,
  add column lead_follow_up_msg_1 text not null default 'היי {name}, תודה שפניתם אלינו! רציתי לוודא שקיבלתם את הפרטים ולבדוק אם יש שאלות נוספות 😊',
  add column lead_follow_up_msg_2 text not null default 'היי {name}, רק מזכירים שאנחנו כאן וזמינים לכל שאלה לגבי האירוע שלכם. נשמח לעזור ולסגור פרטים!',
  add column lead_follow_up_msg_3 text not null default 'היי {name}, זו הודעה אחרונה מאיתנו — אם עדיין רלוונטי, נשמח לשמוע ולתאם. בהצלחה עם האירוע, איפה שלא תבחרו!';
