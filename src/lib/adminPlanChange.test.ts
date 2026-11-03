import { describe, expect, it } from "vitest";
import { isSubscriptionPlan, planChangeDecision, planChangeRefusal, renewsAutomatically, type PlanChangeAccount } from "@/lib/adminPlanChange";

const paying: PlanChangeAccount = { plan: "monthly", payplus_recurring_uid: "rec-1", cancel_at_period_end: false, pending_plan: null };
const noRecurring: PlanChangeAccount = { plan: "monthly", payplus_recurring_uid: null, cancel_at_period_end: false, pending_plan: null };

describe("planChangeDecision", () => {
  it("moves a ₪59 פרו monthly customer to פרו+ monthly and keeps charging ₪59 (the first real case)", () => {
    expect(planChangeDecision(paying, "studio_pro_monthly", 59)).toEqual({ ok: true, plan: "studio_pro_monthly", keepsCharging: 59, priceDiffers: true });
  });

  it("uses the standing order's last charge, not the old plan's current price", () => {
    // A recurring created when פרו cost ₪50 keeps charging ₪50.
    expect(planChangeDecision(paying, "studio_pro_monthly", 50)).toMatchObject({ ok: true, keepsCharging: 50 });
    // No charge known yet: the plan's price is what the recurring was created with.
    expect(planChangeDecision(paying, "studio_pro_monthly", null)).toMatchObject({ ok: true, keepsCharging: 59 });
  });

  it("notes when the charge matches the new plan's price (moving back)", () => {
    const upgraded: PlanChangeAccount = { ...paying, plan: "studio_pro_monthly" };
    expect(planChangeDecision(upgraded, "monthly", 59)).toEqual({ ok: true, plan: "monthly", keepsCharging: 59, priceDiffers: false });
  });

  it("refuses a different billing cycle while a standing order renews", () => {
    expect(planChangeDecision(paying, "studio_pro_annual", 59)).toEqual({ ok: false, reason: "cycle_mismatch" });
    expect(planChangeDecision(paying, "annual", 59)).toEqual({ ok: false, reason: "cycle_mismatch" });
    expect(planChangeDecision({ ...paying, plan: "annual" }, "studio_pro_monthly", 500)).toEqual({ ok: false, reason: "cycle_mismatch" });
    expect(planChangeDecision({ ...paying, plan: "annual" }, "studio_pro_annual", 500)).toMatchObject({ ok: true, keepsCharging: 500 });
  });

  it("allows any plan when nothing renews, and says there's no charge", () => {
    expect(planChangeDecision(noRecurring, "studio_pro_annual", null)).toEqual({ ok: true, plan: "studio_pro_annual", keepsCharging: null, priceDiffers: false });
    const cancelling: PlanChangeAccount = { ...paying, cancel_at_period_end: true };
    expect(planChangeDecision(cancelling, "studio_pro_annual", 59)).toMatchObject({ ok: true, keepsCharging: null });
  });

  it("refuses the same plan, an unknown plan, and an account with a scheduled switch", () => {
    expect(planChangeDecision(paying, "monthly", 59)).toEqual({ ok: false, reason: "same_plan" });
    expect(planChangeDecision(paying, "gold", 59)).toEqual({ ok: false, reason: "unknown_plan" });
    expect(planChangeDecision(paying, undefined, 59)).toEqual({ ok: false, reason: "unknown_plan" });
    expect(planChangeDecision(paying, "toString", 59)).toEqual({ ok: false, reason: "unknown_plan" });
    expect(planChangeDecision({ ...paying, pending_plan: "annual" }, "studio_pro_monthly", 59)).toEqual({ ok: false, reason: "pending_switch" });
  });
});

describe("helpers", () => {
  it("renewsAutomatically needs a standing order that wasn't cancelled", () => {
    expect(renewsAutomatically(paying)).toBe(true);
    expect(renewsAutomatically(noRecurring)).toBe(false);
    expect(renewsAutomatically({ ...paying, cancel_at_period_end: true })).toBe(false);
  });

  it("isSubscriptionPlan only accepts the six plans", () => {
    expect(isSubscriptionPlan("basic_monthly")).toBe(true);
    expect(isSubscriptionPlan("studio_pro_annual")).toBe(true);
    expect(isSubscriptionPlan("constructor")).toBe(false);
    expect(isSubscriptionPlan(3)).toBe(false);
  });

  it("planChangeRefusal is null for an allowed target", () => {
    expect(planChangeRefusal(paying, "basic_monthly")).toBeNull();
  });
});
