import { SUBSCRIPTION_PLANS, type SubscriptionPlan } from "@/lib/stages";
import { billedCycleAmount, planCycleAmount } from "@/lib/billedAmount";
import { monthlySwitchDate } from "@/lib/billingDates";

// Admin dashboard › "שינוי מסלול" (owner's requests, 2026-11-03: "change a user's plan without asking
// you every time", then "ask whether to change the charge too, with a double confirmation").
//
// The plan (which tools are open) always changes right away. The charge is the admin's choice:
//   - keep: PayPlus is never touched, the standing order keeps charging what it charges today
//     (the first case: פרו+ for a customer paying ₪59);
//   - change: from the next renewal the customer pays the new plan's price. It's the same mechanism
//     as a switch the customer schedules in Settings › Subscription: pending_plan, then the daily cron
//     cancels the standing order 2 days before the renewal and emails a payment link for the new
//     price (subscription-lifecycle step 3). Monthly standing orders only.
//
// One hard rule with a standing order: the new plan must have the same billing cycle. Every renewal
// extends the paid period by the PLAN's cycle (the PayPlus webhook), so a monthly ₪59 charge on an
// annual plan would buy a year. Moving between monthly and annual needs a new payment, which the
// customer makes in Settings › Subscription.

const DAY = 86_400_000;
/** A price change needs this much time before the renewal, so the cron cancels before PayPlus charges. */
export const BILLING_CHANGE_MIN_DAYS = 3;

export type PlanChangeAccount = {
  plan: SubscriptionPlan;
  payplus_recurring_uid: string | null;
  cancel_at_period_end: boolean;
  pending_plan: SubscriptionPlan | null;
  current_period_end: string | null;
};

export type PlanChangeRefusal =
  | "unknown_plan"
  | "same_plan"
  | "cycle_mismatch"
  | "pending_switch"
  | "no_recurring"
  | "annual_billing"
  | "same_price"
  | "renewal_too_close";

export type PlanChangeDecision =
  | {
      ok: true;
      plan: SubscriptionPlan;
      /** What the standing order charges today per cycle, or null when nothing renews. */
      charging: number | null;
      /** Keep: null. Change: the new price and the date the standing order is cancelled. */
      billingChange: { amount: number; switchAt: string; renewalAt: string } | null;
      /** Keep with a standing order whose charge differs from the new plan's price. */
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

/** A price change the admin scheduled: pending_plan equal to the plan (a customer's switch never is). */
export function isAdminPriceChange(account: Pick<PlanChangeAccount, "plan" | "pending_plan">): boolean {
  return !!account.pending_plan && account.pending_plan === account.plan;
}

/** Whether the "change the charge too" question applies to this account and target at all. */
export function canChangeBilling(account: PlanChangeAccount, target: SubscriptionPlan, recurringAmount: number | null): boolean {
  return (
    renewsAutomatically(account) &&
    SUBSCRIPTION_PLANS[account.plan].cycleMonths === 1 &&
    SUBSCRIPTION_PLANS[target].cycleMonths === 1 &&
    billedCycleAmount(account.plan, recurringAmount) !== planCycleAmount(target)
  );
}

/**
 * The decision for one change. `recurringAmount` is the last charge of the standing order on file
 * (`recurringChargeAmount`), null when unknown. `changeBilling` is the admin's answer to the question.
 */
export function planChangeDecision(
  account: PlanChangeAccount,
  target: unknown,
  recurringAmount: number | null,
  changeBilling: boolean,
  now = new Date()
): PlanChangeDecision {
  if (!isSubscriptionPlan(target)) return { ok: false, reason: "unknown_plan" };
  // A switch already scheduled (by the customer in Settings › Subscription, or an earlier price
  // change from here) cancels the standing order on its date. Changing the plan under it would mix
  // the two: cancel it first.
  if (account.pending_plan) return { ok: false, reason: "pending_switch" };
  const renews = renewsAutomatically(account);
  if (renews && SUBSCRIPTION_PLANS[target].cycleMonths !== SUBSCRIPTION_PLANS[account.plan].cycleMonths) {
    return { ok: false, reason: "cycle_mismatch" };
  }
  const charging = renews ? billedCycleAmount(account.plan, recurringAmount) : null;

  if (!changeBilling) {
    if (target === account.plan) return { ok: false, reason: "same_plan" };
    return { ok: true, plan: target, charging, billingChange: null, priceDiffers: charging != null && charging !== planCycleAmount(target) };
  }

  if (!renews) return { ok: false, reason: "no_recurring" };
  if (SUBSCRIPTION_PLANS[account.plan].cycleMonths > 1) return { ok: false, reason: "annual_billing" };
  const amount = planCycleAmount(target);
  if (charging === amount) return { ok: false, reason: target === account.plan ? "same_plan" : "same_price" };
  if (!account.current_period_end) return { ok: false, reason: "renewal_too_close" };
  const renewal = new Date(account.current_period_end);
  if (renewal.getTime() - now.getTime() < BILLING_CHANGE_MIN_DAYS * DAY) return { ok: false, reason: "renewal_too_close" };
  return {
    ok: true,
    plan: target,
    charging,
    billingChange: { amount, switchAt: monthlySwitchDate(renewal).toISOString(), renewalAt: renewal.toISOString() },
    priceDiffers: false,
  };
}

export const PLAN_CHANGE_REFUSAL_TEXT: Record<PlanChangeRefusal, string> = {
  unknown_plan: "מסלול לא מוכר",
  same_plan: "החשבון כבר במסלול הזה",
  cycle_mismatch: "יש לחשבון הוראת קבע, ולכן אפשר לעבור רק למסלול עם אותו מחזור חיוב (חודשי לחודשי, שנתי לשנתי). מעבר בין חודשי לשנתי דורש תשלום חדש, שהלקוח עושה בהגדרות › מנוי.",
  pending_switch: "כבר מתוזמנת לחשבון החלפת מסלול או שינוי מחיר. קודם מבטלים אותה, ורק אז משנים.",
  no_recurring: "אין לחשבון הוראת קבע פעילה, ולכן אין חיוב לשנות. כשישלם, ישלם לפי המסלול שיבחר.",
  annual_billing: "שינוי החיוב של הוראת קבע שנתית נעשה רק על ידי הלקוח, בהגדרות › מנוי.",
  same_price: "הלקוח כבר משלם את המחיר של המסלול הזה.",
  renewal_too_close: "החידוש הבא בעוד פחות מ-3 ימים, ואין זמן לבטל את הוראת הקבע לפניו. אפשר לשנות את החיוב אחרי החידוש.",
};
