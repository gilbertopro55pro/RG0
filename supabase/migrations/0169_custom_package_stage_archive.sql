-- Removing a stage from a custom package no longer deletes it (audit 2026-10-13). event_stages
-- point at the package stage (custom_stage_id ... on delete cascade), so deleting it erased that
-- stage, and whether it was done, from every existing event of the package. A removed stage is
-- archived: new events and the package editor skip it, existing events keep it.
alter table custom_package_stages add column if not exists archived_at timestamptz;
