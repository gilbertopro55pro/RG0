-- Security fix (audit 2026-10-13, Supabase advisor): SECURITY DEFINER functions callable by
-- anyone holding the public anon key.
-- increment_rate_limit: only the server (service role) uses it (lib/rateLimit.ts). Anyone could
-- fill another IP's signup / intake-chat bucket to lock it out, or bloat the table.
create or replace function public.increment_rate_limit(p_key text, p_window_start timestamptz)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare n integer;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  insert into public.rate_limit_windows (key, window_start, count)
  values (p_key, p_window_start, 1)
  on conflict (key, window_start) do update set count = rate_limit_windows.count + 1
  returning count into n;
  return n;
end;
$function$;

-- photographer_storage_bytes: a photographer's own usage (Settings, the plan switch) or any
-- photographer's for the server. Returned anyone's usage before.
create or replace function public.photographer_storage_bytes(p_photographer_id uuid)
returns bigint
language sql
stable
security definer
set search_path to 'public'
as $function$
  select case when coalesce(auth.role(), '') = 'service_role' or p_photographer_id = auth.uid() then
    coalesce((
      select sum(gp.file_size_bytes) from public.gallery_photos gp
      join public.galleries g on g.id = gp.gallery_id
      where g.photographer_id = p_photographer_id
    ), 0)
    +
    coalesce((
      select sum(gv.file_size_bytes) from public.gallery_videos gv
      join public.galleries g on g.id = gv.gallery_id
      where g.photographer_id = p_photographer_id
    ), 0)
  else null end;
$function$;

-- Fixed search_path (advisor: function_search_path_mutable).
alter function public.leads_touch_activity() set search_path = public;
alter function public.phone_key(text) set search_path = public;
alter function public.photographers_guard_privileged() set search_path = public;
alter function public.record_print_house_download(uuid) set search_path = public;
