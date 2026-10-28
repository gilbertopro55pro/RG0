import type { Photographer } from "@/lib/types";
import type { SubscriptionPlan } from "@/lib/stages";
import { dunningDueDate } from "@/lib/dunning";

// Free trial (2026-09-24): 14 days, no payment details, full Pro+ features (the account's `plan`
// is set to TRIAL_PLAN for the trial; the plan picked at signup is kept in `signup_plan`), with
// storage capped so trial galleries don't turn into real storage costs.
export const TRIAL_DAYS = 14;
export const TRIAL_PLAN: SubscriptionPlan = "studio_pro_monthly";
export const TRIAL_STORAGE_CAP_BYTES = 5 * 1024 * 1024 * 1024;
// From this many days left, the home screen shows the "choose a plan" banner (day 10 onward).
export const TRIAL_BANNER_DAYS_LEFT = 4;

type AccessFields = Pick<Photographer, "subscription_status" | "trial_ends_at">;

export function isInTrial(p: AccessFields, now = new Date()): boolean {
  return p.subscription_status === "trialing" && !!p.trial_ends_at && new Date(p.trial_ends_at) > now;
}

export function trialEnded(p: AccessFields, now = new Date()): boolean {
  return p.subscription_status !== "active" && !!p.trial_ends_at && new Date(p.trial_ends_at) <= now;
}

// Whole days left, rounded up (the last day counts as 1).
export function trialDaysLeft(p: AccessFields, now = new Date()): number {
  if (!p.trial_ends_at) return 0;
  return Math.max(0, Math.ceil((new Date(p.trial_ends_at).getTime() - now.getTime()) / 86_400_000));
}

// The one gate every photographer page uses: a paid subscription, or a trial that hasn't ended.
// A "trialing" row without trial_ends_at predates the trial feature and is treated as active.
export function hasAppAccess(p: AccessFields, now = new Date()): boolean {
  if (p.subscription_status === "active") return true;
  if (p.subscription_status === "trialing") return !p.trial_ends_at || new Date(p.trial_ends_at) > now;
  return false;
}

// From this many days before the paid period ends, an active account with nothing to renew it pays
// from /billing itself.
export const RENEWAL_PAYMENT_DAYS_BEFORE = 3;

// An active account whose paid period is ending (or has ended) with no recurring to renew it: a plan
// switch whose new checkout wasn't paid yet (the cron cancels the old recurring and emails a link),
// or a recurring removed in PayPlus. /billing is open to it and Settings › Subscription links there,
// so the person can pay without the emailed link. Not offered earlier: PayPlus starts the new
// recurring on the payment day, so paying early would give up the days already paid for.
// Also an account whose recurring's renewal never landed (its due date in lib/dunning.ts passed): the
// card was declined, and the dunning emails send it here to pay with another one. The new checkout
// cancels the old recurring (the PayPlus webhook), so two never charge in parallel.
export function renewalPaymentDue(
  p: Pick<Photographer, "subscription_status" | "payplus_recurring_uid" | "cancel_at_period_end" | "current_period_end">,
  now = new Date()
): boolean {
  if (p.subscription_status !== "active" || p.cancel_at_period_end || !p.current_period_end) return false;
  if (p.payplus_recurring_uid) return renewalMissed(p, now);
  return new Date(p.current_period_end).getTime() - now.getTime() <= RENEWAL_PAYMENT_DAYS_BEFORE * 86_400_000;
}

// A recurring that should have renewed the account and didn't.
export function renewalMissed(
  p: Pick<Photographer, "payplus_recurring_uid" | "current_period_end">,
  now = new Date()
): boolean {
  const due = dunningDueDate(p);
  return !!p.payplus_recurring_uid && !!due && now >= due;
}
