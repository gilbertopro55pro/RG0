-- events <-> event_assignees RLS policies referenced each other directly, causing
-- "infinite recursion detected in policy for relation events". Break the cycle with
-- security-definer helper functions that bypass RLS on their internal lookup.

create or replace function public.is_event_owner(target_event_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.events e
    where e.id = target_event_id and e.photographer_id = auth.uid()
  );
$$;

create or replace function public.is_assigned_to_event(target_event_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.event_assignees ea
    where ea.event_id = target_event_id and ea.team_member_id = auth.uid()
  );
$$;

drop policy if exists "events_select_assigned" on public.events;
create policy "events_select_assigned"
  on public.events for select
  using (public.is_assigned_to_event(id));

drop policy if exists "event_assignees_manage_by_photographer" on public.event_assignees;
create policy "event_assignees_manage_by_photographer"
  on public.event_assignees for all
  using (public.is_event_owner(event_id))
  with check (public.is_event_owner(event_id));

drop policy if exists "event_stages_all_assigned" on public.event_stages;
create policy "event_stages_all_assigned"
  on public.event_stages for all
  using (public.is_assigned_to_event(event_id))
  with check (public.is_assigned_to_event(event_id));

drop policy if exists "event_notifications_all_assigned" on public.event_notifications;
create policy "event_notifications_all_assigned"
  on public.event_notifications for all
  using (public.is_assigned_to_event(event_id))
  with check (public.is_assigned_to_event(event_id));
