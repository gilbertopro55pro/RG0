-- The intake assistant's monthly conversation count, kept on its own (audit 2026-10-13).
-- It used to be a count of this month's bot_conversations rows. Those rows are the photographer's
-- own (RLS "all own"), and deleting a lead deletes its conversation, so deleting rows gave the
-- slots back: the cap that guards the platform's AI cost could be reset from the browser. The
-- counter is written only by the server (no write policy, a service-role-only function), and one
-- statement both checks the cap and takes the slot, so two new chats at once can't both take the
-- last one.
create table if not exists intake_monthly_usage (
  photographer_id uuid not null references photographers(id) on delete cascade,
  month text not null, -- 'YYYY-MM', Israel time
  used integer not null default 0,
  primary key (photographer_id, month)
);
alter table intake_monthly_usage enable row level security;
create policy intake_monthly_usage_read_own on intake_monthly_usage
  for select using ((select auth.uid()) = photographer_id);

-- Takes one of this month's slots. Returns the month's new count, or null when the cap is used up.
create or replace function claim_intake_monthly_slot(p_photographer uuid, p_month text, p_cap integer)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_used integer;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'server only' using errcode = '42501';
  end if;
  if p_cap <= 0 then
    return null;
  end if;
  insert into intake_monthly_usage as u (photographer_id, month, used)
  values (p_photographer, p_month, 1)
  on conflict (photographer_id, month) do update set used = u.used + 1
    where u.used < p_cap
  returning used into v_used;
  return v_used;
end;
$$;
revoke execute on function claim_intake_monthly_slot(uuid, text, integer) from public, anon, authenticated;

-- This month so far, from the conversations, so the meter and the cap carry on where they were.
insert into intake_monthly_usage (photographer_id, month, used)
select photographer_id, to_char(now() at time zone 'Asia/Jerusalem', 'YYYY-MM'), count(*)
from bot_conversations
where channel = 'web' and extra_credit = false and client_turns > 0
  and created_at >= (date_trunc('month', now() at time zone 'Asia/Jerusalem') at time zone 'Asia/Jerusalem')
group by photographer_id
on conflict (photographer_id, month) do nothing;
