import { SUBSCRIPTION_PLANS, type SubscriptionPlan } from "@/lib/stages";
import { billedCycleAmount, planCycleAmount } from "@/lib/billedAmount";

// Admin dashboard › "שינוי מסלול" (owner's request, 2026-11-03: "change a user's plan without asking
// you every time"). The change is to the account's plan only: it decides which tools are open. It
// never touches PayPlus. A customer with a standing order keeps being charged exactly what it
// charges today (owner's decision for the first case: פרו+ for a customer paying ₪59).
//
// One hard rule with a standing order: the new plan must have the same billing cycle. Every renewal
// extends the paid period by the PLAN's cycle (the PayPlus webhook), so a monthly ₪59 charge on an
// annual plan would buy a year. Moving between monthly and annual needs a new payment, which the
// customer makes in Settings › Subscription.

export type PlanChangeAccount = {
  plan: SubscriptionPlan;
  payplus_recurring_uid: string | null;
  cancel_at_period_end: boolean;
  pending_plan: SubscriptionPlan | null;
};

export type PlanChangeRefusal = "unknown_plan" | "same_plan" | "cycle_mismatch" | "pending_switch";

export type PlanChangeDecision =
  | {
      ok: true;
      plan: SubscriptionPlan;
      /** What the standing order keeps charging per cycle, or null when nothing renews. */
      keepsCharging: number | null;
      /** True when that differs from the new plan's own price. */
      priceDiffers: boolean;
    }
  | { ok: false; reason: PlanChangeRefusal };

export function isSubscriptionPlan(value: unknown): value is SubscriptionPlan {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(SUBSCRIPTION_PLANS, value);
}

/** A standing order that will charge again: on file and not cancelled by the customer. */
export function renewsAutomatically(account: Pick<PlanChangeAccount, "payplus_recurring_uid" | "cancel_at_period_end">): boolean {
  return !!account.payplus_recurring_uid && !account.cancel_at_period_end;
}

/** Why a target plan can't be picked for this account, or null when it can. */
export function planChangeRefusal(account: PlanChangeAccount, target: unknown): PlanChangeRefusal | null {
  if (!isSubscriptionPlan(target)) return "unknown_plan";
  if (target === account.plan) return "same_plan";
  // A switch the customer scheduled (Settings › Subscription) cancels the standing order on its date
  // and emails a payment link for ITS plan. Changing the plan under it would mix the two.
  if (account.pending_plan) return "pending_switch";
  if (renewsAutomatically(account) && SUBSCRIPTION_PLANS[target].cycleMonths !== SUBSCRIPTION_PLANS[account.plan].cycleMonths) {
    return "cycle_mismatch";
  }
  return null;
}

/**
 * The decision for one change. `recurringAmount` is the last charge of the standing order on file
 * (`recurringChargeAmount`), null when unknown.
 */
export function planChangeDecision(account: PlanChangeAccount, target: unknown, recurringAmount: number | null): PlanChangeDecision {
  const reason = planChangeRefusal(account, target);
  if (reason) return { ok: false, reason };
  const plan = target as SubscriptionPlan;
  if (!renewsAutomatically(account)) return { ok: true, plan, keepsCharging: null, priceDiffers: false };
  const keepsCharging = billedCycleAmount(account.plan, recurringAmount);
  return { ok: true, plan, keepsCharging, priceDiffers: keepsCharging !== planCycleAmount(plan) };
}

export const PLAN_CHANGE_REFUSAL_TEXT: Record<PlanChangeRefusal, string> = {
  unknown_plan: "מסלול לא מוכר",
  same_plan: "החשבון כבר במסלול הזה",
  cycle_mismatch: "יש לחשבון הוראת קבע, ולכן אפשר לעבור רק למסלול עם אותו מחזור חיוב (חודשי לחודשי, שנתי לשנתי). מעבר בין חודשי לשנתי דורש תשלום חדש, שהלקוח עושה בהגדרות › מנוי.",
  pending_switch: "הלקוח כבר תזמן החלפת מסלול בהגדרות › מנוי. קודם מבטלים אותה, ורק אז מחליפים מכאן.",
};
