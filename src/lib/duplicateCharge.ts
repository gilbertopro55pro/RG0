import { addBillingMonths } from "@/lib/billingDates";

// The webhook's guard against charging one subscription twice (2026-11-04): every subscription so
// far got one charge more than it should (the page payment, then the same recurring again the next
// night), and the owner refunded each by hand. A charge this decides is a duplicate is refunded
// right away and changes nothing on the account: no new period, no receipt.

const DAY = 86_400_000;

// A recurring's charges fall in billing slots counted from its payment page (start_date_on_payment_date):
// slot 0 is the page payment, slot k starts k cycles later. PayPlus's nightly batch can run a few hours
// before the page's time of day, so each slot opens SLOT_EARLY_DAYS early.
export const SLOT_EARLY_DAYS = 3;

export function chargeSlot(anchor: Date, at: Date, cycleMonths: number): number {
  let k = 0;
  while (k < 1200 && addBillingMonths(anchor, (k + 1) * cycleMonths).getTime() - SLOT_EARLY_DAYS * DAY <= at.getTime()) k++;
  return k;
}

// A renewal is a duplicate only when the same recurring already took money for the same slot. A
// declined charge never counts (only paid ones are passed in), so a retry after a failure, a day or
// two weeks late, is the slot's first payment and goes through (owner, 2026-11-04). The next slot's
// charge after a late retry goes through too: it's the next month's.
export function duplicateRenewal(p: { anchor: Date; cycleMonths: number; paidChargesAt: Date[]; now?: Date }): boolean {
  const slot = chargeSlot(p.anchor, p.now ?? new Date(), p.cycleMonths);
  return p.paidChargesAt.some((d) => chargeSlot(p.anchor, d, p.cycleMonths) === slot);
}

// A second payment page within this time of a paid charge, on an account that's already active and
// not cancelling: the same person paying twice (two tabs, a double click on PayPlus's page). Kept
// short: a plan switch or a renewal paid at /billing comes a full cycle after the last charge.
export const CHECKOUT_DUPLICATE_DAYS = 3;

export function duplicateCheckout(p: {
  previousPaidChargesAt: Date[];
  subscriptionStatus: string;
  cancelAtPeriodEnd: boolean;
  now?: Date;
}): boolean {
  const now = (p.now ?? new Date()).getTime();
  return (
    p.subscriptionStatus === "active" &&
    !p.cancelAtPeriodEnd &&
    p.previousPaidChargesAt.some((d) => now - d.getTime() < CHECKOUT_DUPLICATE_DAYS * DAY)
  );
}

// How far back the "two charges in one cycle" admin alert looks.
export function renewalWindowDays(cycleMonths: number): number {
  return cycleMonths > 1 ? 300 : 20;
}
