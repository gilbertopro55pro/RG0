-- Magnet frames, stage 3 (2026-10-22): the client approves a frame in the portal, and a QR code on
-- the magnet opens the event's gallery for guests.

-- Client approval. Written by the server only (the portal is anonymous; the photographer's share
-- goes through the API), but the photographer's own row policy covers them too, which only affects
-- their own frames.
alter table magnet_frame_designs
  add column if not exists client_shared_at timestamptz,
  add column if not exists client_approved_at timestamptz,
  add column if not exists client_comment text,
  add column if not exists client_comment_at timestamptz;

-- The guests' view-only link a magnet's QR opens: one per gallery, created on the first scan.
alter table gallery_share_links
  add column if not exists purpose text check (purpose in ('magnet_guests'));
create unique index if not exists gallery_share_links_magnet_guests
  on gallery_share_links (gallery_id) where purpose = 'magnet_guests';
