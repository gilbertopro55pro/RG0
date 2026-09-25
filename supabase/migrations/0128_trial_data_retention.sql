-- Trial data retention (2026-09-25, owner's decision): an account whose 14-day trial ended without
-- a payment is deleted 30 days after the trial end, with an email warning 7 days and 1 day before
-- (subscription-lifecycle cron + lib/accountDeletion.ts).
alter table photographers
  add column if not exists keep_account boolean not null default false,
  add column if not exists trial_deletion_warned_at timestamptz,
  add column if not exists trial_deletion_final_warned_at timestamptz;

comment on column photographers.keep_account is
  'Never auto-delete this account (QA/test accounts, special cases). Set by the admin only.';

-- What was deleted and when — no personal data, just enough to answer "what happened to account X".
create table if not exists deleted_accounts_log (
  id uuid primary key default gen_random_uuid(),
  photographer_id uuid not null,
  reason text not null,
  trial_ended_at timestamptz,
  storage_objects_removed integer not null default 0,
  deleted_at timestamptz not null default now()
);
alter table deleted_accounts_log enable row level security;
-- No policies: service role only.

-- The QA signup/test accounts the owner decided to keep.
update photographers set keep_account = true where email like 'gilbertopro55+qa%';
