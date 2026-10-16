-- Uploads seen from another device (owner, 2026-10-16: an upload running on the computer didn't
-- show on the phone). An upload runs in one browser tab (lib/galleryUploads.ts) or in the desktop
-- app / FTP watcher, and only that place knew about it. Now it leaves a row here that the galleries
-- list and the gallery page of every device read (lib/remoteUploads.ts).
--
-- Browser uploads: the uploading tab writes its own row every few seconds (id `<tab>:<upload key>`),
-- with the total, so another device shows "X מתוך Y" and notices when it stops moving (the tab was
-- closed, the computer slept). The desktop app and the FTP watcher send one file at a time with no
-- total: their server routes bump a row per saved photo (bump_upload_progress), and a row that
-- stopped moving reads as finished. Old rows are cleared by the writing tab (over a day old).

create table if not exists public.upload_progress (
  id text primary key,
  photographer_id uuid not null references public.photographers(id) on delete cascade,
  gallery_id uuid not null references public.galleries(id) on delete cascade,
  kind text not null default 'photos' check (kind in ('photos', 'portfolio', 'videos')),
  source text not null default 'web' check (source in ('web', 'desktop', 'ftp')),
  device text,
  title text,
  total integer,
  done integer not null default 0,
  succeeded integer not null default 0,
  pct real,
  phase text not null default 'uploading' check (phase in ('uploading', 'done', 'cancelled', 'offline')),
  started_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists upload_progress_owner_idx on public.upload_progress (photographer_id, updated_at desc);

alter table public.upload_progress enable row level security;

-- The writer's own rows, for a gallery of their own (the parent check, migration 0163).
create policy "upload_progress_own" on public.upload_progress for all
  using ((select auth.uid()) = photographer_id)
  with check (
    (select auth.uid()) = photographer_id
    and gallery_id in (select id from public.galleries where photographer_id = (select auth.uid()))
  );

-- One more photo saved by the desktop app or the FTP watcher. A row quiet for 10 minutes starts a
-- new count. Server only (service role), see migration 0164 on security definer functions.
create or replace function public.bump_upload_progress(p_photographer uuid, p_gallery uuid, p_source text, p_title text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'forbidden';
  end if;
  insert into public.upload_progress (id, photographer_id, gallery_id, kind, source, device, title, done, succeeded, phase, started_at, updated_at)
  values (p_source || ':' || p_gallery, p_photographer, p_gallery, 'photos', p_source, p_source, p_title, 1, 1, 'uploading', now(), now())
  on conflict (id) do update set
    done = case when upload_progress.updated_at > now() - interval '10 minutes' then upload_progress.done + 1 else 1 end,
    succeeded = case when upload_progress.updated_at > now() - interval '10 minutes' then upload_progress.succeeded + 1 else 1 end,
    started_at = case when upload_progress.updated_at > now() - interval '10 minutes' then upload_progress.started_at else now() end,
    title = excluded.title,
    phase = 'uploading',
    updated_at = now();
end;
$$;

revoke execute on function public.bump_upload_progress(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.bump_upload_progress(uuid, uuid, text, text) to service_role;
