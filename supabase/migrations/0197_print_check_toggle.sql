-- An on/off switch for the print-house check task (owner, 2026-10-27, "עדכון שקוף"; migration 0196):
-- photographers.print_check, on by default, in Settings › Automation (PrintCheckSettings). Off, a
-- print send that finishes adds no task.
alter table public.photographers
  add column if not exists print_check boolean not null default true;

create or replace function public.album_print_check_task()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_on boolean;
  v_days smallint;
  v_lang text;
  v_name text;
  v_sent date := (now() at time zone 'Asia/Jerusalem')::date;
  v_title text;
  v_notes text;
  v_task uuid;
begin
  select p.print_check, coalesce(p.print_check_days, 5), coalesce(p.ui_lang, 'he')
    into v_on, v_days, v_lang
    from photographers p
   where p.id = new.photographer_id;
  if not found or not v_on then
    return new;
  end if;

  select coalesce(nullif(trim(e.client_name), ''), nullif(trim(g.title), ''))
    into v_name
    from galleries g
    left join events e on e.id = g.event_id
   where g.id = new.gallery_id;

  v_title := case v_lang
    when 'en' then case when v_name is null then 'Check with the print house whether the album is ready'
                        else 'Check with the print house whether ' || v_name || '''s album is ready' end
    when 'ru' then case when v_name is null then 'Уточнить в типографии, готов ли альбом'
                        else 'Уточнить в типографии, готов ли альбом: ' || v_name end
    else case when v_name is null then 'לבדוק מול הדפוס אם האלבום מוכן'
              else 'לבדוק מול הדפוס אם האלבום של ' || v_name || ' מוכן' end
  end;
  v_notes := case v_lang
    when 'en' then 'Sent to the print house on ' || to_char(v_sent, 'DD/MM/YYYY')
    when 'ru' then 'Отправлено в типографию ' || to_char(v_sent, 'DD.MM.YYYY')
    else 'נשלח לדפוס ב-' || to_char(v_sent, 'DD.MM.YYYY')
  end;

  insert into tasks (user_id, task_date, title, notes)
  values (new.photographer_id, v_sent + v_days, left(v_title, 200), v_notes)
  returning id into v_task;

  new.print_check_task_id := v_task;
  return new;
end;
$$;

revoke execute on function public.album_print_check_task() from public, anon, authenticated;
