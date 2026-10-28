-- Main tabs and sub-tabs in a gallery (owner, 2026-10-28): one gallery can hold two events, e.g. a
-- "בוק בר מצווה" main tab with its locations as sub-tabs and an "עלייה לתורה" main tab with
-- "1.אוירה", "2.חתן"… under it. Two levels only: a sub-tab never has sub-tabs of its own.
--
-- Deleting a main tab deletes its sub-tabs (cascade); their photos stay in the gallery without a tab
-- (gallery_photos.folder_id is "on delete set null"), unless the photographer chose to delete them too.

alter table public.gallery_folders
  add column if not exists parent_id uuid references public.gallery_folders(id) on delete cascade;

create index if not exists gallery_folders_parent_id_idx on public.gallery_folders (parent_id);

-- A name is unique among its siblings, not in the whole gallery: both events may have "1.אוירה".
create unique index if not exists gallery_folders_gallery_parent_name_key
  on public.gallery_folders (gallery_id, parent_id, name) nulls not distinct;

alter table public.gallery_folders drop constraint if exists gallery_folders_gallery_id_name_key;

-- The parent is a main tab of the same gallery, and a tab with sub-tabs can't become a sub-tab.
-- Runs as the caller: under RLS a parent of another studio isn't visible, so it reads as not found.
create or replace function public.gallery_folders_check_parent()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  p record;
begin
  if new.parent_id is null then
    return new;
  end if;
  if new.parent_id = new.id then
    raise exception 'folder_parent_self';
  end if;
  select gallery_id, parent_id into p from public.gallery_folders where id = new.parent_id;
  if not found or p.gallery_id <> new.gallery_id then
    raise exception 'folder_parent_gallery';
  end if;
  if p.parent_id is not null then
    raise exception 'folder_parent_depth';
  end if;
  if exists (select 1 from public.gallery_folders c where c.parent_id = new.id) then
    raise exception 'folder_has_children';
  end if;
  return new;
end;
$$;

create or replace trigger gallery_folders_parent_guard
  before insert or update of parent_id, gallery_id on public.gallery_folders
  for each row execute function public.gallery_folders_check_parent();
