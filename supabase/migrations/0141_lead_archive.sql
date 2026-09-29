-- Lead retention (owner's decision, 2026-09-29): an open lead with no activity for 13 days moves to
-- an archive on day 14, stays there 14 more days (it can still be converted to an event or deleted
-- for good), then is deleted permanently. Leads converted to an event never expire.
alter table leads
  add column if not exists last_activity_at timestamptz not null default now(),
  add column if not exists archived_at timestamptz;

-- Existing leads start their clock today (owner's choice), not from when they were created.
update leads set last_activity_at = now();

-- Any change to a lead is activity, and activity brings an archived lead back (a quote attached to
-- it, a returning client, a conversion to an event). Archiving itself isn't activity.
create or replace function leads_touch_activity() returns trigger
language plpgsql as $$
begin
  if new.archived_at is not null and old.archived_at is null then
    return new;
  end if;
  new.archived_at := null;
  new.last_activity_at := now();
  return new;
end;
$$;

drop trigger if exists leads_touch_activity on leads;
create trigger leads_touch_activity before update on leads
  for each row execute function leads_touch_activity();

create index if not exists leads_archive_idx on leads (archived_at, last_activity_at);
