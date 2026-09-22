-- One-shot marker for the auto-created "ברירת מחדל" custom package (two stages: יום הצילום ->
-- מסירה סופית) that the new-event form offers as its default. Claimed atomically by the client
-- (update ... where default_package_seeded = false returning id) so two open tabs can't both
-- create it, and so a photographer who later deletes that package doesn't get it re-created.
alter table public.photographers add column default_package_seeded boolean not null default false;
