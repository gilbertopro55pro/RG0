import { describe, expect, it } from "vitest";
import {
  canChangeBilling,
  isAdminPriceChange,
  isSubscriptionPlan,
  planChangeDecision,
  renewsAutomatically,
  type PlanChangeAccount,
} from "@/lib/adminPlanChange";

const NOW = new Date("2026-11-03T08:00:00Z");
const paying: PlanChangeAccount = {
  plan: "monthly",
  payplus_recurring_uid: "rec-1",
  cancel_at_period_end: false,
  pending_plan: null,
  current_period_end: "2026-12-03T07:18:01Z",
};
const noRecurring: PlanChangeAccount = { ...paying, payplus_recurring_uid: null };

describe("planChangeDecision: keep the charge", () => {
  it("moves a ₪59 פרו monthly customer to פרו+ monthly and keeps charging ₪59 (the first real case)", () => {
    expect(planChangeDecision(paying, "studio_pro_monthly", 59, false, NOW)).toEqual({
      ok: true,
      plan: "studio_pro_monthly",
      charging: 59,
      billingChange: null,
      priceDiffers: true,
    });
  });

  it("uses the standing order's last charge, not the old plan's current price", () => {
    expect(planChangeDecision(paying, "studio_pro_monthly", 50, false, NOW)).toMatchObject({ ok: true, charging: 50 });
    expect(planChangeDecision(paying, "studio_pro_monthly", null, false, NOW)).toMatchObject({ ok: true, charging: 59 });
  });

  it("notes when the charge matches the new plan's price (moving back)", () => {
    const upgraded: PlanChangeAccount = { ...paying, plan: "studio_pro_monthly" };
    expect(planChangeDecision(upgraded, "monthly", 59, false, NOW)).toMatchObject({ ok: true, plan: "monthly", priceDiffers: false });
  });

  it("refuses a different billing cycle while a standing order renews", () => {
    expect(planChangeDecision(paying, "studio_pro_annual", 59, false, NOW)).toEqual({ ok: false, reason: "cycle_mismatch" });
    expect(planChangeDecision({ ...paying, plan: "annual" }, "studio_pro_monthly", 500, false, NOW)).toEqual({ ok: false, reason: "cycle_mismatch" });
    expect(planChangeDecision({ ...paying, plan: "annual" }, "studio_pro_annual", 500, false, NOW)).toMatchObject({ ok: true, charging: 500 });
  });

  it("allows any plan when nothing renews", () => {
    expect(planChangeDecision(noRecurring, "studio_pro_annual", null, false, NOW)).toMatchObject({ ok: true, charging: null, billingChange: null });
    expect(planChangeDecision({ ...paying, cancel_at_period_end: true }, "studio_pro_annual", 59, false, NOW)).toMatchObject({ ok: true, charging: null });
  });

  it("refuses the same plan, an unknown plan, and an account with a scheduled switch", () => {
    expect(planChangeDecision(paying, "monthly", 59, false, NOW)).toEqual({ ok: false, reason: "same_plan" });
    expect(planChangeDecision(paying, "gold", 59, false, NOW)).toEqual({ ok: false, reason: "unknown_plan" });
    expect(planChangeDecision(paying, "toString", 59, false, NOW)).toEqual({ ok: false, reason: "unknown_plan" });
    expect(planChangeDecision({ ...paying, pending_plan: "annual" }, "studio_pro_monthly", 59, false, NOW)).toEqual({ ok: false, reason: "pending_switch" });
  });
});

describe("planChangeDecision: change the charge too", () => {
  it("charges the new plan's price from the next renewal, cancelling the standing order 2 days before", () => {
    expect(planChangeDecision(paying, "studio_pro_monthly", 59, true, NOW)).toEqual({
      ok: true,
      plan: "studio_pro_monthly",
      charging: 59,
      billingChange: { amount: 119, switchAt: "2026-12-01T07:18:01.000Z", renewalAt: "2026-12-03T07:18:01.000Z" },
      priceDiffers: false,
    });
  });

  it("aligns the price of the current plan (פרו+ paid at ₪59 → ₪119)", () => {
    const rudy: PlanChangeAccount = { ...paying, plan: "studio_pro_monthly" };
    expect(planChangeDecision(rudy, "studio_pro_monthly", 59, true, NOW)).toMatchObject({ ok: true, billingChange: { amount: 119 } });
    // Keeping the charge on the same plan changes nothing.
    expect(planChangeDecision(rudy, "studio_pro_monthly", 59, false, NOW)).toEqual({ ok: false, reason: "same_plan" });
  });

  it("refuses when nothing would change, nothing renews, or the standing order is annual", () => {
    expect(planChangeDecision(paying, "monthly", 59, true, NOW)).toEqual({ ok: false, reason: "same_plan" });
    expect(planChangeDecision({ ...paying, plan: "studio_pro_monthly" }, "monthly", 59, true, NOW)).toEqual({ ok: false, reason: "same_price" });
    expect(planChangeDecision(noRecurring, "studio_pro_monthly", null, true, NOW)).toEqual({ ok: false, reason: "no_recurring" });
    expect(planChangeDecision({ ...paying, plan: "annual" }, "studio_pro_annual", 500, true, NOW)).toEqual({ ok: false, reason: "annual_billing" });
  });

  it("refuses when the renewal is less than 3 days away (the cron couldn't cancel in time)", () => {
    const soon: PlanChangeAccount = { ...paying, current_period_end: "2026-11-06T07:00:00Z" };
    expect(planChangeDecision(soon, "studio_pro_monthly", 59, true, NOW)).toEqual({ ok: false, reason: "renewal_too_close" });
    const justEnough: PlanChangeAccount = { ...paying, current_period_end: "2026-11-06T08:00:00Z" };
    expect(planChangeDecision(justEnough, "studio_pro_monthly", 59, true, NOW)).toMatchObject({ ok: true });
    expect(planChangeDecision({ ...paying, current_period_end: null }, "studio_pro_monthly", 59, true, NOW)).toEqual({ ok: false, reason: "renewal_too_close" });
  });

  it("refuses while a switch or price change is already scheduled", () => {
    expect(planChangeDecision({ ...paying, pending_plan: "monthly" }, "studio_pro_monthly", 59, true, NOW)).toEqual({ ok: false, reason: "pending_switch" });
  });
});

describe("helpers", () => {
  it("canChangeBilling: a monthly standing order whose charge differs from the target's price", () => {
    expect(canChangeBilling(paying, "studio_pro_monthly", 59)).toBe(true);
    expect(canChangeBilling(paying, "monthly", 59)).toBe(false);
    expect(canChangeBilling({ ...paying, plan: "studio_pro_monthly" }, "studio_pro_monthly", 59)).toBe(true);
    expect(canChangeBilling(paying, "basic_annual", 59)).toBe(false);
    expect(canChangeBilling(noRecurring, "studio_pro_monthly", null)).toBe(false);
    expect(canChangeBilling({ ...paying, plan: "annual" }, "studio_pro_annual", 500)).toBe(false);
  });

  it("isAdminPriceChange: pending_plan equal to the plan", () => {
    expect(isAdminPriceChange({ plan: "studio_pro_monthly", pending_plan: "studio_pro_monthly" })).toBe(true);
    expect(isAdminPriceChange({ plan: "monthly", pending_plan: "annual" })).toBe(false);
    expect(isAdminPriceChange({ plan: "monthly", pending_plan: null })).toBe(false);
  });

  it("renewsAutomatically needs a standing order that wasn't cancelled", () => {
    expect(renewsAutomatically(paying)).toBe(true);
    expect(renewsAutomatically(noRecurring)).toBe(false);
    expect(renewsAutomatically({ ...paying, cancel_at_period_end: true })).toBe(false);
  });

  it("isSubscriptionPlan only accepts the six plans", () => {
    expect(isSubscriptionPlan("basic_monthly")).toBe(true);
    expect(isSubscriptionPlan("constructor")).toBe(false);
    expect(isSubscriptionPlan(3)).toBe(false);
  });
});
