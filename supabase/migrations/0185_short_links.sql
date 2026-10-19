-- Short links (owner, 2026-10-19: "כל קישור שהמערכת שולחת צריך להיות קצר ונעים לעין"). A file sent in
-- a message (a quote PDF, the album design, a conversation summary, an export for the print house)
-- travelled as the storage's signed URL, a few hundred characters long, and the signup confirmation
-- as a long signed query. Now: myframeflow.com/l/<10 characters> (app/l/[code]), which signs a
-- fresh short-lived URL for the file, or redirects to the stored page, on every open until
-- expires_at (the same lifetime the long link had).
-- Server only: written and read with the service role, no policies (lib/shortFileLinks.ts).
create table if not exists public.short_links (
  code text primary key,
  photographer_id uuid references public.photographers(id) on delete cascade,
  bucket text,
  path text,
  filename text,
  -- A page on this site ("/api/auth/confirm-email?…"), when the link isn't to a file.
  target text,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  constraint short_links_target_or_file check ((target is not null) <> (bucket is not null and path is not null)),
  constraint short_links_target_relative check (target is null or (target like '/%' and target not like '//%'))
);
create index if not exists short_links_expires_idx on public.short_links (expires_at);
alter table public.short_links enable row level security;
