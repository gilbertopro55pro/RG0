import { describe, expect, it } from "vitest";
import { billedCycleAmount, billedPerMonth, chargesByPhotographer, planCycleAmount, recurringChargeAmount } from "@/lib/billedAmount";

describe("planCycleAmount", () => {
  it("is the monthly price for a monthly plan and the yearly sum for an annual one", () => {
    expect(planCycleAmount("monthly")).toBe(59);
    expect(planCycleAmount("studio_pro_monthly")).toBe(119);
    expect(planCycleAmount("annual")).toBe(500);
    expect(planCycleAmount("studio_pro_annual")).toBe(990);
  });
});

describe("recurringChargeAmount", () => {
  const charges = [
    { recurring_uid: "new", amount: "59" },
    { recurring_uid: "old", amount: "50" },
    { recurring_uid: "old", amount: "50" },
  ];

  it("takes the newest charge of the standing order on file", () => {
    expect(recurringChargeAmount("new", charges)).toBe(59);
    expect(recurringChargeAmount("old", charges)).toBe(50);
  });

  it("matches the uid regardless of letter case (uuid column vs payload text)", () => {
    expect(recurringChargeAmount("ABC-1", [{ recurring_uid: "abc-1", amount: "59" }])).toBe(59);
  });

  it("is null with no standing order, or when none of its charges arrived", () => {
    expect(recurringChargeAmount(null, charges)).toBeNull();
    expect(recurringChargeAmount("other", charges)).toBeNull();
    expect(recurringChargeAmount("new", [])).toBeNull();
  });

  it("skips rows without a usable amount and accepts numbers", () => {
    expect(recurringChargeAmount("r", [{ recurring_uid: "r", amount: null }, { recurring_uid: "r", amount: "abc" }, { recurring_uid: "r", amount: 42.5 }])).toBe(42.5);
    expect(recurringChargeAmount("r", [{ recurring_uid: "r", amount: "0" }])).toBeNull();
  });
});

describe("billedCycleAmount / billedPerMonth", () => {
  it("uses what the standing order charges over the plan's price (פרו+ kept at ₪59)", () => {
    expect(billedCycleAmount("studio_pro_monthly", 59)).toBe(59);
    expect(billedPerMonth("studio_pro_monthly", 59)).toBe(59);
  });

  it("falls back to the plan's own price", () => {
    expect(billedCycleAmount("studio_pro_monthly", null)).toBe(119);
    expect(billedPerMonth("studio_pro_monthly", null)).toBe(119);
    expect(billedPerMonth("annual", null)).toBe(42);
  });

  it("spreads an annual charge over 12 months, rounded like the plan table", () => {
    expect(billedPerMonth("annual", 500)).toBe(42);
    expect(billedPerMonth("studio_pro_annual", 990)).toBe(83);
    expect(billedPerMonth("studio_pro_annual", 500)).toBe(42);
  });
});

describe("chargesByPhotographer", () => {
  it("groups rows per account and keeps their order", () => {
    const grouped = chargesByPhotographer([
      { photographer_id: "a", recurring_uid: "1", amount: "59" },
      { photographer_id: "b", recurring_uid: "2", amount: "119" },
      { photographer_id: "a", recurring_uid: "1", amount: "50" },
      { photographer_id: null, recurring_uid: "3", amount: "1" },
    ]);
    expect(grouped.get("a")?.map((r) => r.amount)).toEqual(["59", "50"]);
    expect(grouped.get("b")?.length).toBe(1);
    expect(grouped.size).toBe(2);
  });
});
