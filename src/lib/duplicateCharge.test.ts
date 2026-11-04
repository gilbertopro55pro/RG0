import { describe, it, expect } from "vitest";
import { chargeSlot, duplicateCheckout, duplicateRenewal } from "@/lib/duplicateCharge";

const DAY = 86_400_000;
// rudyaz's recurring nEUrv: the payment page at 09:18 Israel time.
const page = new Date("2026-11-03T07:18:01Z");
const at = (iso: string) => new Date(iso);

describe("duplicateRenewal", () => {
  it("refunds the recurring's extra charge the night after the page payment (rudyaz, 3.11 → 4.11)", () => {
    expect(duplicateRenewal({ anchor: page, cycleMonths: 1, paidChargesAt: [page], now: at("2026-11-04T02:19:42Z") })).toBe(true);
  });

  it("refunds a charge 13 days after the page (the 10.9 batch)", () => {
    expect(duplicateRenewal({ anchor: page, cycleMonths: 1, paidChargesAt: [page], now: new Date(page.getTime() + 13 * DAY) })).toBe(true);
  });

  it("lets the real renewal through, even from a batch hours before the page's time of day", () => {
    expect(duplicateRenewal({ anchor: page, cycleMonths: 1, paidChargesAt: [page], now: at("2026-12-03T02:00:00Z") })).toBe(false);
  });

  it("a retry after a declined renewal is that month's first payment (only paid charges are passed)", () => {
    // December's charge was declined on 3.12; PayPlus's retry succeeds a day later, or two weeks later.
    expect(duplicateRenewal({ anchor: page, cycleMonths: 1, paidChargesAt: [page], now: at("2026-12-04T02:00:00Z") })).toBe(false);
    expect(duplicateRenewal({ anchor: page, cycleMonths: 1, paidChargesAt: [page], now: at("2026-12-20T02:00:00Z") })).toBe(false);
  });

  it("after a late retry, the next month's scheduled charge goes through", () => {
    const paid = [page, at("2026-12-20T02:00:00Z")];
    expect(duplicateRenewal({ anchor: page, cycleMonths: 1, paidChargesAt: paid, now: at("2027-01-03T02:00:00Z") })).toBe(false);
  });

  it("a second success in the same month after the retry is a duplicate", () => {
    const paid = [page, at("2026-12-04T02:00:00Z")];
    expect(duplicateRenewal({ anchor: page, cycleMonths: 1, paidChargesAt: paid, now: at("2026-12-05T02:00:00Z") })).toBe(true);
  });

  it("annual: a second charge inside the year is a duplicate, the yearly one isn't", () => {
    expect(duplicateRenewal({ anchor: page, cycleMonths: 12, paidChargesAt: [page], now: at("2027-03-01T02:00:00Z") })).toBe(true);
    expect(duplicateRenewal({ anchor: page, cycleMonths: 12, paidChargesAt: [page], now: at("2027-11-03T02:00:00Z") })).toBe(false);
  });

  it("follows the Israeli calendar (Jan 31 → Feb 28)", () => {
    const jan31 = at("2027-01-31T10:00:00Z");
    expect(chargeSlot(jan31, at("2027-02-28T02:00:00Z"), 1)).toBe(1);
  });
});

describe("duplicateCheckout", () => {
  const now = at("2026-11-04T10:00:00Z");
  const base = { subscriptionStatus: "active", cancelAtPeriodEnd: false, now };
  it("refunds a second page payment within 3 days on an active account (two tabs)", () => {
    expect(duplicateCheckout({ ...base, previousPaidChargesAt: [new Date(now.getTime() - 60_000)] })).toBe(true);
  });
  it("never refunds a first payment: trial, past due, cancelled coming back, renewal paid at /billing", () => {
    expect(duplicateCheckout({ ...base, subscriptionStatus: "trialing", previousPaidChargesAt: [] })).toBe(false);
    expect(duplicateCheckout({ ...base, subscriptionStatus: "past_due", previousPaidChargesAt: [new Date(now.getTime() - DAY)] })).toBe(false);
    expect(duplicateCheckout({ ...base, cancelAtPeriodEnd: true, previousPaidChargesAt: [new Date(now.getTime() - DAY)] })).toBe(false);
    expect(duplicateCheckout({ ...base, previousPaidChargesAt: [new Date(now.getTime() - 30 * DAY)] })).toBe(false);
  });
});
