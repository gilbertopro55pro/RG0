-- Check with the print house (owner, 2026-10-27, "עדכון שקוף"): when an album is sent to the print
-- house (a print-house job, gallery_album_export_jobs.send_to_email, becomes "ready"), a task goes
-- into the photographer's to-do list (tasks, migration 0193) for N days later: check whether the
-- album is ready. N is photographers.print_check_days, 5 by default, 3–14 (Settings › Automation).
-- The task then shows on that day in the tasks panel and in the daily tasks reminder
-- (lib/morningDigest.ts). One task per send; print_check_task_id links them. A trigger, so every
-- way of sending (the album tool, the home screen's quick access, sending again) is covered
-- without touching the PDF worker's code. Its title follows the photographer's language
-- (photographers.ui_lang).
alter table public.photographers
  add column if not exists print_check_days smallint not null default 5
    check (print_check_days between 3 and 14);

alter table public.gallery_album_export_jobs
  add column if not exists print_check_task_id uuid references public.tasks(id) on delete set null;

create or replace function public.album_print_check_task()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_days smallint;
  v_lang text;
  v_name text;
  v_sent date := (now() at time zone 'Asia/Jerusalem')::date;
  v_title text;
  v_notes text;
  v_task uuid;
begin
  select coalesce(p.print_check_days, 5), coalesce(p.ui_lang, 'he')
    into v_days, v_lang
    from photographers p
   where p.id = new.photographer_id;
  if not found then
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

create or replace trigger gallery_album_export_jobs_print_check
  before update of status on public.gallery_album_export_jobs
  for each row
  when (new.status = 'ready' and old.status is distinct from 'ready'
        and new.send_to_email is not null and new.print_check_task_id is null)
  execute function public.album_print_check_task();
