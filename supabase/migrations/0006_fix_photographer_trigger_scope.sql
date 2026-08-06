-- The trigger fired for every new auth.users row, including team members created via the
-- admin API (which carry no user_metadata), silently making them photographers too.
-- Only the real /signup flow sets 'plan' in user_metadata — use that as the marker.
create or replace function public.handle_new_photographer()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if new.raw_user_meta_data ? 'plan' then
    insert into public.photographers (id, name, phone, email, plan)
    values (
      new.id,
      coalesce(new.raw_user_meta_data->>'name', ''),
      coalesce(new.raw_user_meta_data->>'phone', ''),
      new.email,
      coalesce(new.raw_user_meta_data->>'plan', 'monthly')
    );
  end if;
  return new;
end;
$$;
