import { describe, it, expect } from "vitest";
import { duplicateSubscriptionCharge } from "@/lib/duplicateCharge";

const now = new Date("2026-11-04T02:19:42Z");
const daysAgo = (d: number) => new Date(now.getTime() - d * 86_400_000);
const base = { storedPlanCycleMonths: 1, subscriptionStatus: "active", cancelAtPeriodEnd: false, now };

describe("duplicateSubscriptionCharge", () => {
  it("refunds the recurring's extra charge the night after the page payment (rudyaz, 3.11 → 4.11)", () => {
    expect(duplicateSubscriptionCharge({ ...base, type: "recurring", previousChargesAt: [new Date("2026-11-03T07:18:01Z")] })).toBe(true);
  });
  it("refunds the 13-days-early renewal seen on 10.9", () => {
    expect(duplicateSubscriptionCharge({ ...base, type: "recurring", previousChargesAt: [daysAgo(13)] })).toBe(true);
  });
  it("lets a real monthly renewal through (28+ days, February included)", () => {
    expect(duplicateSubscriptionCharge({ ...base, type: "recurring", previousChargesAt: [daysAgo(28)] })).toBe(false);
    expect(duplicateSubscriptionCharge({ ...base, type: "recurring", previousChargesAt: [] })).toBe(false);
  });
  it("annual: a renewal inside the year is a duplicate, the yearly one isn't", () => {
    expect(duplicateSubscriptionCharge({ ...base, storedPlanCycleMonths: 12, type: "recurring", previousChargesAt: [daysAgo(40)] })).toBe(true);
    expect(duplicateSubscriptionCharge({ ...base, storedPlanCycleMonths: 12, type: "recurring", previousChargesAt: [daysAgo(365)] })).toBe(false);
  });
  it("refunds a second page payment within 3 days on an active account (two tabs)", () => {
    expect(duplicateSubscriptionCharge({ ...base, type: "payment_page", previousChargesAt: [daysAgo(0.01)] })).toBe(true);
  });
  it("never refunds a first payment: trial, past due, cancelled coming back, plan switch, renewal paid at /billing", () => {
    expect(duplicateSubscriptionCharge({ ...base, subscriptionStatus: "trialing", type: "payment_page", previousChargesAt: [] })).toBe(false);
    expect(duplicateSubscriptionCharge({ ...base, subscriptionStatus: "past_due", type: "payment_page", previousChargesAt: [daysAgo(1)] })).toBe(false);
    expect(duplicateSubscriptionCharge({ ...base, cancelAtPeriodEnd: true, type: "payment_page", previousChargesAt: [daysAgo(1)] })).toBe(false);
    expect(duplicateSubscriptionCharge({ ...base, type: "payment_page", previousChargesAt: [daysAgo(30)] })).toBe(false);
  });
});
