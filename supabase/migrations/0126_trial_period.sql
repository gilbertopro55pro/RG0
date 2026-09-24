-- 14-day free trial (2026-09-24). New signups start as 'trialing' with full Pro+ features and no
-- payment details; when trial_ends_at passes they land on the plan picker (/billing) until they pay.
--   trial_ends_at          — end of the free trial (null for accounts that never had one)
--   signup_plan            — the plan picked at signup; pre-selected on the plan picker at trial end
--                            (during the trial `plan` itself is set to the Pro+ plan)
--   trial_reminder_sent_at — the "your trial ends tomorrow" email was sent
alter table public.photographers
  add column if not exists trial_ends_at timestamptz,
  add column if not exists signup_plan text,
  add column if not exists trial_reminder_sent_at timestamptz;

-- One trial per phone number: a normalized key (digits only, +972/972 folded to a leading 0) so
-- "050-111 2222", "+972501112222" and "0501112222" all count as the same number.
create or replace function public.phone_key(p text)
returns text
language sql
immutable
as $$
  select case
    when d like '972%' then '0' || substr(d, 4)
    else d
  end
  from (select regexp_replace(coalesce(p, ''), '\D', '', 'g') as d) s
$$;

-- Called by the signup route (service role) before creating a trial account.
create or replace function public.phone_already_registered(p text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.photographers
    where public.phone_key(phone) = public.phone_key(p) and public.phone_key(p) <> ''
  )
$$;

revoke all on function public.phone_already_registered(text) from public, anon, authenticated;
