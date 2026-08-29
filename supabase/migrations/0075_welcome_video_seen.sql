-- Mandatory welcome-tour video, shown once on a photographer's very first dashboard visit.
-- Backfilled to true for every existing row so it never surfaces for anyone already using the
-- system — only genuinely new signups see it.
alter table photographers add column welcome_video_seen boolean not null default false;
update photographers set welcome_video_seen = true;
