-- Campaign tracking (owner, 2026-10-14). Which ad campaign brought each lead, what the photographer
-- spent on it, and what came back: leads, quotes, booked events and their value (lib/campaigns.ts,
-- /leads/campaigns). Plus the phone notification when a lead reminder from the new-lead popup is due.

-- The chat link's utm_campaign / utm_content (Meta fills them from {{campaign.name}} / {{ad.name}}).
alter table public.bot_conversations
  add column if not exists referral_campaign text,
  add column if not exists referral_ad text;
alter table public.leads
  add column if not exists referral_campaign text,
  add column if not exists referral_ad text;

-- When the reminder's phone notification went out (api/cron/lead-reminders). Setting a new reminder
-- clears it.
alter table public.leads add column if not exists assistant_remind_pushed_at timestamptz;

-- Neither is activity on the lead (migrations 0144, 0171).
create or replace function public.leads_touch_activity()
 returns trigger
 language plpgsql
 set search_path to 'public'
as $function$
begin
  if new.archived_at is not null and old.archived_at is null then
    return new;
  end if;
  if (new.assistant_seen_at is distinct from old.assistant_seen_at
      or new.assistant_remind_at is distinct from old.assistant_remind_at
      or new.assistant_remind_pushed_at is distinct from old.assistant_remind_pushed_at)
     and (to_jsonb(new) - 'assistant_seen_at' - 'assistant_remind_at' - 'assistant_remind_pushed_at')
       = (to_jsonb(old) - 'assistant_seen_at' - 'assistant_remind_at' - 'assistant_remind_pushed_at') then
    return new;
  end if;
  new.archived_at := null;
  new.last_activity_at := now();
  return new;
end;
$function$;

-- What the photographer spent on ads, per campaign per month ('' = ads without a campaign name).
-- Written only through api/campaigns/spend (the server-side subscription lock applies there).
create table if not exists public.ad_spend (
  photographer_id uuid not null references public.photographers(id) on delete cascade,
  month text not null check (month ~ '^\d{4}-\d{2}$'), -- 'YYYY-MM', Israel time
  campaign text not null default '' check (char_length(campaign) <= 120),
  amount numeric(10, 2) not null check (amount >= 0 and amount <= 10000000),
  updated_at timestamptz not null default now(),
  primary key (photographer_id, month, campaign)
);
alter table public.ad_spend enable row level security;
create policy ad_spend_read_own on public.ad_spend
  for select using ((select auth.uid()) = photographer_id);

-- A deleted lead (the 28-day retention purge, or deleted by hand) leaves an anonymous line behind,
-- so a campaign's numbers don't shrink when its unanswered leads are purged. No name, phone, email
-- or conversation: only when it came in, from where, and how far it got.
create table if not exists public.lead_history (
  id uuid primary key default gen_random_uuid(),
  photographer_id uuid not null references public.photographers(id) on delete cascade,
  lead_created_at timestamptz not null,
  removed_at timestamptz not null default now(),
  source text,
  referral_source text,
  referral_campaign text,
  referral_ad text,
  status text,
  quote_sent boolean not null default false,
  quoted_amount numeric,
  converted_event_id uuid
);
create index if not exists lead_history_photographer_idx on public.lead_history (photographer_id, lead_created_at);
alter table public.lead_history enable row level security;
create policy lead_history_read_own on public.lead_history
  for select using ((select auth.uid()) = photographer_id);

create or replace function public.leads_keep_history()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  -- Not when the whole account is being deleted (its photographer row is already gone).
  if exists (select 1 from photographers where id = old.photographer_id) then
    insert into lead_history (photographer_id, lead_created_at, source, referral_source, referral_campaign,
                              referral_ad, status, quote_sent, quoted_amount, converted_event_id)
    values (old.photographer_id, old.created_at, old.source, old.referral_source, old.referral_campaign,
            old.referral_ad, old.status, old.quote_sent_at is not null, old.quoted_amount, old.converted_event_id);
  end if;
  return old;
end;
$function$;
revoke all on function public.leads_keep_history() from public, anon, authenticated;

create or replace trigger leads_keep_history before delete on public.leads
  for each row execute function public.leads_keep_history();

-- The last AI analysis of the campaigns, per photographer and period (api/campaigns/insights): the
-- same numbers get the same answer back without another model call. Server-written only.
create table if not exists public.campaign_insights (
  photographer_id uuid not null references public.photographers(id) on delete cascade,
  period text not null,
  data_hash text not null,
  lang text not null,
  result jsonb not null,
  created_at timestamptz not null default now(),
  primary key (photographer_id, period)
);
alter table public.campaign_insights enable row level security;
create policy campaign_insights_read_own on public.campaign_insights
  for select using ((select auth.uid()) = photographer_id);
