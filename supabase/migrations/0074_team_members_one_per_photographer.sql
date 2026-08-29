-- Cap team members at one per photographer, closing a possible loophole to use the system
-- without paying for a subscription. Enforced at the DB level (not just in the API route) so a
-- race between two concurrent inserts can't slip past the application-level count check.
alter table public.team_members add constraint team_members_one_per_photographer unique (photographer_id);
