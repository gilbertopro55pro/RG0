-- Custom packages can now be priced per event type too, same as the 5 built-in packages —
-- exactly one of `package` / `custom_package_id` is set, mirroring the events/event_stages xor
-- pattern from migration 0028.
alter table public.package_prices alter column package drop not null;
alter table public.package_prices add column custom_package_id uuid references public.custom_packages(id) on delete cascade;
alter table public.package_prices add constraint package_prices_package_xor_custom check (
  (package is not null and custom_package_id is null) or (package is null and custom_package_id is not null)
);

-- The old `unique (event_type_id, package)` only guards built-in rows (multiple NULLs don't
-- conflict), so add the custom-package equivalent explicitly.
alter table public.package_prices add constraint package_prices_custom_unique unique (event_type_id, custom_package_id);
