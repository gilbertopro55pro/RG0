-- Per-gallery FTP Live credentials — a photographer points their camera's built-in FTP/FTPS
-- client (or tethering software) at these during an event, and photos land in this exact
-- gallery within seconds. Scoped to one gallery, not the whole account, so a leaked credential
-- (typed into a camera menu, genuinely more exposed than a normal password) only ever grants
-- upload access to one event's gallery, never anything else. Plaintext, not hashed — the
-- photographer has to be able to re-read the password to type it into a camera; this is the same
-- risk tier as galleries.access_token (an unguessable secret gating one gallery's uploads, not
-- account access). Null until first generated (see the ftp-credentials API route) — most
-- galleries will never use this feature.
alter table public.galleries add column ftp_username text unique;
alter table public.galleries add column ftp_password text;
