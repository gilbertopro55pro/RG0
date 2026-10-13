-- The songs the client chose for the event's clip, from the portal (owner, 2026-10-13: written in
-- the portal instead of sent on WhatsApp). {"single": "..."} or {"calm": "...", "upbeat": "..."}
-- (a wedding's highlights clip), plus "chosenAt". Each value is a song name or a YouTube link.
alter table events add column if not exists clip_songs jsonb;
