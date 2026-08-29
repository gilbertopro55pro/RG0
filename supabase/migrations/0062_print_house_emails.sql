-- Saved print-house email addresses per photographer, managed both from Settings and directly
-- inside the album editor's "send to print house" flow — a photographer can have several (e.g.
-- one per lab they use) with one marked default so the send picker can pre-select it.
create table public.print_house_emails (
  id uuid primary key default gen_random_uuid(),
  photographer_id uuid not null references public.photographers(id) on delete cascade,
  email text not null,
  label text not null default '',
  is_default boolean not null default false,
  created_at timestamptz not null default now()
);

create index print_house_emails_photographer_id_idx on public.print_house_emails(photographer_id);

-- Only one default per photographer — enforced here, not just in application code, since the
-- "default sorts first" promise in the UI breaks silently if two rows ever end up marked default.
create unique index print_house_emails_one_default_idx on public.print_house_emails(photographer_id) where is_default;

alter table public.print_house_emails enable row level security;

create policy "print_house_emails_all_own"
  on public.print_house_emails for all
  using (auth.uid() = photographer_id)
  with check (auth.uid() = photographer_id);
