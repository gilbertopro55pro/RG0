-- A photographer's leads with the same phone number (last 9 digits, so 050-..., +972-50-... and
-- 97250... all match), newest first. Used to warn before creating a duplicate lead (quote builder,
-- new lead form) and to let the intake assistant reuse a returning client's open lead.
-- Service role only: the caller passes the photographer id after its own auth check.
create or replace function find_leads_by_phone(p_photographer uuid, p_phone text)
returns table (id uuid, name text, phone text, event_date_interest date, event_type_name text, status text, source text, created_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select l.id, l.name, l.phone, l.event_date_interest, l.event_type_name, l.status::text, l.source, l.created_at
  from leads l
  where l.photographer_id = p_photographer
    and length(right(regexp_replace(p_phone, '\D', '', 'g'), 9)) = 9
    and right(regexp_replace(coalesce(l.phone, ''), '\D', '', 'g'), 9) = right(regexp_replace(p_phone, '\D', '', 'g'), 9)
  order by l.created_at desc
  limit 5;
$$;
revoke all on function find_leads_by_phone(uuid, text) from public, anon, authenticated;
