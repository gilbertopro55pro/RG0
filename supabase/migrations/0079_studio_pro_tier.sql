-- Adds a top subscription tier ("סטודיו פרו") above the existing monthly/annual plan — sold as
-- two SKUs of its own (studio_pro_monthly, studio_pro_annual) rather than restructuring `plan`
-- into a separate tier+cycle pair, matching the flat-enum shape this column already has.
alter table public.photographers drop constraint photographers_plan_check;
alter table public.photographers add constraint photographers_plan_check
  check (plan in ('monthly', 'annual', 'studio_pro_monthly', 'studio_pro_annual'));

alter table public.photographers drop constraint photographers_pending_plan_check;
alter table public.photographers add constraint photographers_pending_plan_check
  check (pending_plan in ('monthly', 'annual', 'studio_pro_monthly', 'studio_pro_annual'));

-- Studio Pro's "full branding" perk — a custom accent color applied across every one of the
-- photographer's public galleries (their logo already exists via logo_storage_path). Null means
-- "use each gallery theme's own default accent", same as every photographer has today.
alter table public.photographers add column brand_color text;

-- Studio Pro allows up to 3 team members instead of 1 — the cap itself now lives in application
-- code (src/app/api/team-members/route.ts), keyed off the photographer's plan, since a flat
-- database-level UNIQUE constraint can't express "1 for most plans, 3 for this one".
alter table public.team_members drop constraint team_members_one_per_photographer;
