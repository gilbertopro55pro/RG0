-- Billing hardening (audit 2026-10-13).

-- 1. A PayPlus callback whose first run died half-way (no outcome written) can be taken over by a
--    retry. claimed_at is the time the current run started; the webhook takes over a row only when
--    it is older than any run can last, moving it forward in the same statement (one retry wins).
alter table payplus_webhook_events add column if not exists claimed_at timestamptz not null default now();

-- 2. Server-only billing fields, on top of 0148/0149: the cancel and renewal flags, the scheduled
--    plan switch and the reminder stamps. From the browser, a photographer who cancelled could set
--    cancel_at_period_end back to false (the cron would then never close the account, with no
--    recurring left to pay), or schedule a switch without the server's checks. /api/payplus/cancel
--    and /api/payplus/switch-plan now write these with the service role.
create or replace function photographers_guard_privileged()
returns trigger
language plpgsql
set search_path = public
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
       or new.auto_renew is distinct from old.auto_renew
       or new.cancel_at_period_end is distinct from old.cancel_at_period_end
       or new.pending_plan is distinct from old.pending_plan
       or new.pending_plan_effective_at is distinct from old.pending_plan_effective_at
       or new.renewal_reminder_sent_at is distinct from old.renewal_reminder_sent_at
       or new.trial_reminder_sent_at is distinct from old.trial_reminder_sent_at
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
