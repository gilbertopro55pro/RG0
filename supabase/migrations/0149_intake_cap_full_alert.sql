-- 'YYYY-MM' (Israel) of the last "monthly cap used up" notification (owner, 2026-10-01), once a month.
alter table photographers add column if not exists intake_cap_full_alerted_month text;

-- Server-only, like the other billing fields (0148).
create or replace function photographers_guard_privileged()
returns trigger
language plpgsql
as $$
begin
  if coalesce(auth.role(), '') in ('authenticated', 'anon') then
    if new.email is distinct from old.email
       or new.plan is distinct from old.plan
       or new.subscription_status is distinct from old.subscription_status
       or new.current_period_end is distinct from old.current_period_end
       or new.trial_ends_at is distinct from old.trial_ends_at
       or new.signup_plan is distinct from old.signup_plan
       or new.keep_account is distinct from old.keep_account
       or new.payplus_customer_uid is distinct from old.payplus_customer_uid
       or new.payplus_recurring_uid is distinct from old.payplus_recurring_uid
       or new.whatsapp_bot_phone_number_id is distinct from old.whatsapp_bot_phone_number_id
       or new.trial_deletion_warned_at is distinct from old.trial_deletion_warned_at
       or new.trial_deletion_final_warned_at is distinct from old.trial_deletion_final_warned_at
       or new.missed_renewal_alerted_for is distinct from old.missed_renewal_alerted_for
       or new.intake_extra_conversations is distinct from old.intake_extra_conversations
       or new.intake_cap_alerted_month is distinct from old.intake_cap_alerted_month
       or new.intake_cap_full_alerted_month is distinct from old.intake_cap_full_alerted_month then
      raise exception 'billing fields can only be changed by the server' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;
