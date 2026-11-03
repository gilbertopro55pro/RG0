import { SUBSCRIPTION_PLANS, type SubscriptionPlan } from "@/lib/stages";

// What a subscription really charges (2026-11-03, owner's request: "change a user's plan from the
// admin dashboard"). A PayPlus recurring keeps the amount it was created with, so the plan on the
// account and the money charged can differ:
//   - an account the admin moved to another plan without touching its standing order (פרו+ at ₪59);
//   - a recurring created before a price change (₪50 renewals on a plan that now costs ₪59).
// The truth is the last successful charge of the recurring on file, which is what every renewal
// repeats. Everything the customer reads about the price of their renewal (the reminder email,
// Settings › Subscription) uses it; the plan's list price is only the fallback.

/** One cycle of a plan at checkout: the amount its PayPlus recurring is created with. */
export function planCycleAmount(plan: SubscriptionPlan): number {
  const info = SUBSCRIPTION_PLANS[plan];
  return info.annualAmount ?? info.pricePerMonth;
}

export type RecurringChargeRow = {
  recurring_uid: string | null;
  amount: string | number | null;
};

/**
 * The amount of the latest successful charge made by the recurring on file. `charges` are the
 * account's charged webhook events, newest first. Null when there's no recurring, or none of its
 * charges reached us (the caller falls back to the plan's price).
 */
export function recurringChargeAmount(storedRecurringUid: string | null | undefined, charges: RecurringChargeRow[]): number | null {
  if (!storedRecurringUid) return null;
  // The column is a uuid and the payload a string: compare them the same way.
  const stored = storedRecurringUid.toLowerCase();
  for (const row of charges) {
    if (row.recurring_uid?.toLowerCase() !== stored) continue;
    const amount = typeof row.amount === "number" ? row.amount : Number(row.amount);
    if (Number.isFinite(amount) && amount > 0) return Math.round(amount * 100) / 100;
  }
  return null;
}

/** What one renewal will charge: the recurring's own amount, else the plan's price. */
export function billedCycleAmount(plan: SubscriptionPlan, recurringAmount: number | null): number {
  return recurringAmount ?? planCycleAmount(plan);
}

/** The monthly figure shown next to the plan ("₪59/חודש"), rounded like the plan table's own. */
export function billedPerMonth(plan: SubscriptionPlan, recurringAmount: number | null): number {
  if (recurringAmount == null) return SUBSCRIPTION_PLANS[plan].pricePerMonth;
  return Math.round(recurringAmount / SUBSCRIPTION_PLANS[plan].cycleMonths);
}

/** Groups charged webhook rows (newest first) by account, keeping the order. */
export function chargesByPhotographer<T extends RecurringChargeRow & { photographer_id: string | null }>(rows: T[]): Map<string, T[]> {
  const out = new Map<string, T[]>();
  for (const row of rows) {
    if (!row.photographer_id) continue;
    const list = out.get(row.photographer_id);
    if (list) list.push(row);
    else out.set(row.photographer_id, [row]);
  }
  return out;
}
