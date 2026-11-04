// The webhook's guard against charging one subscription twice (2026-11-04): every subscription so
// far got one charge more than it should (the page payment, then the same recurring again the next
// night), and the owner refunded each by hand. A charge this decides is a duplicate is refunded
// right away and changes nothing on the account: no new period, no receipt.

const DAY = 86_400_000;

// A renewal inside the cycle the last charge paid for is never a real renewal: monthly renewals are
// 28+ days apart, annual ones a year. Counted on the plan the account is on (the plan the previous
// charge paid for), not the one in this callback.
export function renewalWindowDays(cycleMonths: number): number {
  return cycleMonths > 1 ? 300 : 20;
}

// A second payment page within this time of a charge, on an account that's already active and not
// cancelling: the same person paying twice (two tabs, a double click on PayPlus's page). Kept short:
// a plan switch or a renewal paid at /billing comes a full cycle after the last charge.
export const CHECKOUT_DUPLICATE_DAYS = 3;

export function duplicateSubscriptionCharge(p: {
  type: string | undefined;
  previousChargesAt: Date[];
  storedPlanCycleMonths: number;
  subscriptionStatus: string;
  cancelAtPeriodEnd: boolean;
  now?: Date;
}): boolean {
  const now = (p.now ?? new Date()).getTime();
  const within = (days: number) => p.previousChargesAt.some((d) => now - d.getTime() < days * DAY);
  if (p.type === "recurring") return within(renewalWindowDays(p.storedPlanCycleMonths));
  if (p.type === "payment_page") {
    return p.subscriptionStatus === "active" && !p.cancelAtPeriodEnd && within(CHECKOUT_DUPLICATE_DAYS);
  }
  return false;
}
