-- A gallery gets exactly one restore from the "פג תוקף" (expired) tab. After that restore is
-- used, if the gallery reaches the expired tab again (manual delete or natural expiry), it gets
-- a short 3-day grace window instead of the normal 7/14 and cannot be restored again — see
-- GalleryManageView.tsx's settings-modal bottom section and the gallery-lifecycle cron.
alter table public.galleries add column restored_once boolean not null default false;

-- Server-side enforcement, not just hiding the button client-side — mirrors the same "don't trust
-- the UI alone" approach as enforce_gallery_expiry_by_plan (migration 0084). A "restore" is
-- specifically the transition that clears an existing archive (archived_at: not-null -> null);
-- once restored_once is already true, that transition is rejected outright.
create or replace function public.enforce_gallery_restore_once()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.archived_at is not null and new.archived_at is null then
    if old.restored_once then
      raise exception 'gallery % has already used its one-time restore', old.id
        using errcode = 'check_violation';
    end if;
    new.restored_once := true;
  end if;
  return new;
end;
$$;

drop trigger if exists gallery_restore_once on public.galleries;
create trigger gallery_restore_once
  before update on public.galleries
  for each row execute function public.enforce_gallery_restore_once();
