-- Team members (assistants/editors): their own auth.users account, scoped to one photographer
create table public.team_members (
  id uuid primary key references auth.users(id) on delete cascade,
  photographer_id uuid not null references public.photographers(id) on delete cascade,
  name text not null,
  email text not null,
  created_at timestamptz not null default now()
);

create index team_members_photographer_id_idx on public.team_members(photographer_id);

alter table public.team_members enable row level security;

create policy "team_members_select_own_or_managed"
  on public.team_members for select
  using (auth.uid() = id or photographer_id = auth.uid());

create policy "team_members_manage_by_photographer"
  on public.team_members for all
  using (photographer_id = auth.uid())
  with check (photographer_id = auth.uid());

-- Which events each team member is assigned to (photographer-controlled)
create table public.event_assignees (
  event_id uuid not null references public.events(id) on delete cascade,
  team_member_id uuid not null references public.team_members(id) on delete cascade,
  primary key (event_id, team_member_id)
);

alter table public.event_assignees enable row level security;

create policy "event_assignees_manage_by_photographer"
  on public.event_assignees for all
  using (event_id in (select id from public.events where photographer_id = auth.uid()))
  with check (event_id in (select id from public.events where photographer_id = auth.uid()));

create policy "event_assignees_select_own"
  on public.event_assignees for select
  using (team_member_id = auth.uid());

-- Extend event access to assigned team members (in addition to the existing owner-only policies).
-- Events: read-only (client name/date/package/location — no ability to edit or delete).
create policy "events_select_assigned"
  on public.events for select
  using (id in (select event_id from public.event_assignees where team_member_id = auth.uid()));

-- Stages and notifications: full access so assigned team members can mark work done and log updates.
create policy "event_stages_all_assigned"
  on public.event_stages for all
  using (event_id in (select event_id from public.event_assignees where team_member_id = auth.uid()))
  with check (event_id in (select event_id from public.event_assignees where team_member_id = auth.uid()));

create policy "event_notifications_all_assigned"
  on public.event_notifications for all
  using (event_id in (select event_id from public.event_assignees where team_member_id = auth.uid()))
  with check (event_id in (select event_id from public.event_assignees where team_member_id = auth.uid()));
