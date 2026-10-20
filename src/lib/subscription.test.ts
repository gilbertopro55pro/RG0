import { describe, expect, it } from "vitest";
import { SUBSCRIPTION_PLANS, type SubscriptionPlan } from "@/lib/stages";
import {
  RENEWAL_PAYMENT_DAYS_BEFORE,
  TRIAL_BANNER_DAYS_LEFT,
  TRIAL_DAYS,
  TRIAL_PLAN,
  TRIAL_STORAGE_CAP_BYTES,
  hasAppAccess,
  isInTrial,
  renewalPaymentDue,
  trialDaysLeft,
  trialEnded,
} from "@/lib/subscription";
import type { SubscriptionStatus } from "@/lib/types";

const NOW = new Date("2026-10-20T09:00:00Z");
const DAY = 86_400_000;
const at = (offsetMs: number) => new Date(NOW.getTime() + offsetMs).toISOString();
const acct = (subscription_status: SubscriptionStatus, trial_ends_at: string | null) => ({ subscription_status, trial_ends_at });

const PLANS = Object.keys(SUBSCRIPTION_PLANS) as SubscriptionPlan[];

describe("trial settings", () => {
  it("is a 14-day trial on the full Pro+ plan", () => {
    expect(TRIAL_DAYS).toBe(14);
    expect(TRIAL_PLAN).toBe("studio_pro_monthly");
    expect(SUBSCRIPTION_PLANS[TRIAL_PLAN].tier).toBe("studio_pro");
  });

  it("caps trial storage at 5GB", () => {
    expect(TRIAL_STORAGE_CAP_BYTES).toBe(5 * 1024 ** 3);
  });

  it("shows the banner in the last 4 days and opens renewal payment 3 days before the period ends", () => {
    expect(TRIAL_BANNER_DAYS_LEFT).toBe(4);
    expect(RENEWAL_PAYMENT_DAYS_BEFORE).toBe(3);
  });
});

describe("plan prices (what PayPlus charges)", () => {
  it("charges the exact live price for every plan", () => {
    const charged = Object.fromEntries(PLANS.map((p) => [p, SUBSCRIPTION_PLANS[p].annualAmount ?? SUBSCRIPTION_PLANS[p].pricePerMonth]));
    expect(charged).toEqual({
      basic_monthly: 25,
      basic_annual: 228,
      monthly: 59,
      annual: 500,
      studio_pro_monthly: 119,
      studio_pro_annual: 990,
    });
  });

  it("bills monthly plans every month and annual plans every 12 months", () => {
    for (const p of PLANS) {
      const plan = SUBSCRIPTION_PLANS[p];
      if (p.endsWith("annual")) {
        expect(plan.cycleMonths, p).toBe(12);
        expect(plan.annualAmount, p).not.toBeNull();
      } else {
        expect(plan.cycleMonths, p).toBe(1);
        expect(plan.annualAmount, p).toBeNull();
      }
    }
  });

  it("shows an annual plan's monthly price as its yearly charge over 12, rounded", () => {
    expect(SUBSCRIPTION_PLANS.basic_annual.pricePerMonth).toBe(Math.round(228 / 12));
    expect(SUBSCRIPTION_PLANS.annual.pricePerMonth).toBe(Math.round(500 / 12));
    expect(SUBSCRIPTION_PLANS.studio_pro_annual.pricePerMonth).toBe(Math.round(990 / 12));
  });

  it("states the real yearly charge in the annual plan's note", () => {
    for (const p of ["basic_annual", "annual", "studio_pro_annual"] as const) {
      expect(SUBSCRIPTION_PLANS[p].note, p).toContain(`₪${SUBSCRIPTION_PLANS[p].annualAmount}`);
    }
  });

  it("makes each annual plan cheaper than 12 months of the same tier", () => {
    const pairs = [
      ["basic_monthly", "basic_annual"],
      ["monthly", "annual"],
      ["studio_pro_monthly", "studio_pro_annual"],
    ] as const;
    for (const [m, a] of pairs) {
      expect(SUBSCRIPTION_PLANS[m].tier).toBe(SUBSCRIPTION_PLANS[a].tier);
      expect(SUBSCRIPTION_PLANS[a].annualAmount!).toBeLessThan(12 * SUBSCRIPTION_PLANS[m].pricePerMonth);
    }
  });

  it("orders the tiers by price: Pro Start < Pro < Pro+", () => {
    expect(SUBSCRIPTION_PLANS.basic_monthly.pricePerMonth).toBeLessThan(SUBSCRIPTION_PLANS.monthly.pricePerMonth);
    expect(SUBSCRIPTION_PLANS.monthly.pricePerMonth).toBeLessThan(SUBSCRIPTION_PLANS.studio_pro_monthly.pricePerMonth);
  });
});

describe("isInTrial", () => {
  it("is true for a trial that hasn't ended", () => {
    expect(isInTrial(acct("trialing", at(14 * DAY)), NOW)).toBe(true);
    expect(isInTrial(acct("trialing", at(1)), NOW)).toBe(true);
  });

  it("ends exactly at trial_ends_at", () => {
    expect(isInTrial(acct("trialing", at(0)), NOW)).toBe(false);
    expect(isInTrial(acct("trialing", at(-1)), NOW)).toBe(false);
  });

  it("is false for a legacy trialing row with no end date", () => {
    expect(isInTrial(acct("trialing", null), NOW)).toBe(false);
  });

  it("is false once the account paid, even with trial days left", () => {
    expect(isInTrial(acct("active", at(5 * DAY)), NOW)).toBe(false);
  });
});

describe("trialEnded", () => {
  it("is true from the moment the trial ends", () => {
    expect(trialEnded(acct("trialing", at(0)), NOW)).toBe(true);
    expect(trialEnded(acct("trialing", at(-3 * DAY)), NOW)).toBe(true);
  });

  it("is false during the trial", () => {
    expect(trialEnded(acct("trialing", at(1)), NOW)).toBe(false);
  });

  it("is false for an account that paid", () => {
    expect(trialEnded(acct("active", at(-30 * DAY)), NOW)).toBe(false);
  });

  it("is false without a trial end date", () => {
    expect(trialEnded(acct("trialing", null), NOW)).toBe(false);
  });
});

describe("trialDaysLeft", () => {
  it("shows 14 on the first moment of a 14-day trial", () => {
    expect(trialDaysLeft(acct("trialing", at(14 * DAY)), NOW)).toBe(14);
  });

  it("rounds partial days up", () => {
    expect(trialDaysLeft(acct("trialing", at(13.5 * DAY)), NOW)).toBe(14);
    expect(trialDaysLeft(acct("trialing", at(DAY + 1)), NOW)).toBe(2);
  });

  it("counts the last day as 1, down to the last millisecond", () => {
    expect(trialDaysLeft(acct("trialing", at(DAY)), NOW)).toBe(1);
    expect(trialDaysLeft(acct("trialing", at(1)), NOW)).toBe(1);
  });

  it("never goes below 0", () => {
    expect(trialDaysLeft(acct("trialing", at(0)), NOW)).toBe(0);
    expect(trialDaysLeft(acct("trialing", at(-5 * DAY)), NOW)).toBe(0);
  });

  it("is 0 without a trial end date", () => {
    expect(trialDaysLeft(acct("trialing", null), NOW)).toBe(0);
  });

  it("reaches the banner threshold only in the last 4 days", () => {
    const showsBanner = (leftMs: number) => trialDaysLeft(acct("trialing", at(leftMs)), NOW) <= TRIAL_BANNER_DAYS_LEFT;
    expect(showsBanner(4 * DAY + 60_000)).toBe(false);
    expect(showsBanner(4 * DAY)).toBe(true);
    expect(showsBanner(3 * DAY + 23 * 3_600_000)).toBe(true);
  });
});

describe("hasAppAccess", () => {
  it("lets a paid account in, whatever its old trial date says", () => {
    expect(hasAppAccess(acct("active", null), NOW)).toBe(true);
    expect(hasAppAccess(acct("active", at(-60 * DAY)), NOW)).toBe(true);
  });

  it("lets a running trial in until the exact end", () => {
    expect(hasAppAccess(acct("trialing", at(1)), NOW)).toBe(true);
    expect(hasAppAccess(acct("trialing", at(0)), NOW)).toBe(false);
    expect(hasAppAccess(acct("trialing", at(-DAY)), NOW)).toBe(false);
  });

  it("treats a trialing row without trial_ends_at (before the trial feature) as active", () => {
    expect(hasAppAccess(acct("trialing", null), NOW)).toBe(true);
  });

  it("keeps out unpaid, canceled and incomplete accounts, even with trial days left", () => {
    for (const s of ["past_due", "canceled", "incomplete"] as const) {
      expect(hasAppAccess(acct(s, null), NOW), s).toBe(false);
      expect(hasAppAccess(acct(s, at(5 * DAY)), NOW), s).toBe(false);
    }
  });

  it("uses the real clock by default", () => {
    expect(hasAppAccess(acct("trialing", new Date(Date.now() + DAY).toISOString()))).toBe(true);
    expect(hasAppAccess(acct("trialing", new Date(Date.now() - DAY).toISOString()))).toBe(false);
  });
});

describe("renewalPaymentDue", () => {
  const base = {
    subscription_status: "active" as SubscriptionStatus,
    payplus_recurring_uid: null as string | null,
    cancel_at_period_end: false,
    current_period_end: at(2 * DAY) as string | null,
  };

  it("opens payment 3 days before the period ends, not earlier", () => {
    expect(renewalPaymentDue({ ...base, current_period_end: at(3 * DAY + 1) }, NOW)).toBe(false);
    expect(renewalPaymentDue({ ...base, current_period_end: at(3 * DAY) }, NOW)).toBe(true);
    expect(renewalPaymentDue({ ...base, current_period_end: at(DAY) }, NOW)).toBe(true);
  });

  it("stays open once the paid period has ended", () => {
    expect(renewalPaymentDue({ ...base, current_period_end: at(-10 * DAY) }, NOW)).toBe(true);
  });

  it("is never due while a recurring will renew the account", () => {
    expect(renewalPaymentDue({ ...base, payplus_recurring_uid: "rec-123" }, NOW)).toBe(false);
  });

  it("is never due for an account that is cancelling", () => {
    expect(renewalPaymentDue({ ...base, cancel_at_period_end: true }, NOW)).toBe(false);
  });

  it("is never due without a paid period", () => {
    expect(renewalPaymentDue({ ...base, current_period_end: null }, NOW)).toBe(false);
  });

  it("only applies to active accounts", () => {
    for (const s of ["trialing", "past_due", "canceled", "incomplete"] as const) {
      expect(renewalPaymentDue({ ...base, subscription_status: s }, NOW), s).toBe(false);
    }
  });
});
