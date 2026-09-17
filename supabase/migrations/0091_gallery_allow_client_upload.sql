-- Lets a photographer opt a gallery into accepting photo uploads FROM the client themselves (e.g.
-- an empty gallery published specifically so the client can drop their own photos into it) — off
-- by default, since a write-capable public link is a materially different trust posture than the
-- existing read/favorite/label-only client permissions.
alter table public.galleries
  add column allow_client_upload boolean not null default false;
