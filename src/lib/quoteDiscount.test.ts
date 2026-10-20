import { describe, expect, it } from "vitest";
import { discountAmount, quoteTotals, readQuoteDiscount, toQuoteDiscount } from "@/lib/quoteDiscount";

// The builder's VAT rate for a licensed business (עוסק מורשה). An exempt one (עוסק פטור) passes 0.
const VAT = 0.18;

describe("discountAmount", () => {
  it("takes shekels off as typed", () => {
    expect(discountAmount(5000, "amount", 500)).toBe(500);
  });

  it("takes a percent of the items' sum", () => {
    expect(discountAmount(5000, "percent", 10)).toBe(500);
    expect(discountAmount(1999, "percent", 15)).toBe(299.85);
  });

  it("rounds to agorot", () => {
    // 3,333 × 33.3% = 1,109.889
    expect(discountAmount(3333, "percent", 33.3)).toBe(1109.89);
    expect(discountAmount(1000, "amount", 99.999)).toBe(100);
  });

  it("caps a percent at 100", () => {
    expect(discountAmount(5000, "percent", 100)).toBe(5000);
    expect(discountAmount(5000, "percent", 150)).toBe(5000);
  });

  it("never takes more shekels than the items' sum", () => {
    expect(discountAmount(5000, "amount", 7000)).toBe(5000);
  });

  it("is zero with no value, a negative value, or nothing to discount", () => {
    expect(discountAmount(5000, "amount", 0)).toBe(0);
    expect(discountAmount(5000, "percent", 0)).toBe(0);
    expect(discountAmount(5000, "amount", -200)).toBe(0);
    expect(discountAmount(5000, "percent", -10)).toBe(0);
    expect(discountAmount(0, "amount", 500)).toBe(0);
    expect(discountAmount(-100, "percent", 10)).toBe(0);
    expect(discountAmount(5000, "amount", Number.NaN)).toBe(0);
  });
});

describe("quoteTotals", () => {
  it("takes the discount off before VAT and charges VAT on the discounted price", () => {
    expect(quoteTotals(5000, { type: "percent", value: 10 }, VAT)).toEqual({
      itemsSum: 5000,
      discountAmount: 500,
      subtotal: 4500,
      vatAmount: 810,
      total: 5310,
    });
  });

  it("gives the same totals for the same discount in shekels", () => {
    expect(quoteTotals(5000, { type: "amount", value: 500 }, VAT)).toEqual(quoteTotals(5000, { type: "percent", value: 10 }, VAT));
  });

  it("has no discount line when there is no discount", () => {
    expect(quoteTotals(2000, null, VAT)).toEqual({ itemsSum: 2000, discountAmount: 0, subtotal: 2000, vatAmount: 360, total: 2360 });
  });

  it("has no VAT for an exempt business (rate 0)", () => {
    expect(quoteTotals(5000, { type: "amount", value: 500 }, 0)).toEqual({
      itemsSum: 5000,
      discountAmount: 500,
      subtotal: 4500,
      vatAmount: 0,
      total: 4500,
    });
  });

  it("rounds VAT and the total to agorot", () => {
    // 1,999 − 15% = 1,699.15; VAT 305.847 → 305.85; total 2,005.00
    expect(quoteTotals(1999, { type: "percent", value: 15 }, VAT)).toEqual({
      itemsSum: 1999,
      discountAmount: 299.85,
      subtotal: 1699.15,
      vatAmount: 305.85,
      total: 2005,
    });
  });

  it("can't reach every round total in agorot (the 3,050.01 case the price rounding keeps)", () => {
    expect(quoteTotals(2584.74, null, VAT).total).toBe(3049.99);
    expect(quoteTotals(2584.75, null, VAT).total).toBe(3050.01);
  });

  it("goes down to zero with a 100% discount, never below", () => {
    expect(quoteTotals(5000, { type: "percent", value: 100 }, VAT)).toMatchObject({ subtotal: 0, vatAmount: 0, total: 0 });
    expect(quoteTotals(5000, { type: "amount", value: 9000 }, VAT)).toMatchObject({ discountAmount: 5000, subtotal: 0, total: 0 });
  });

  it("keeps subtotal + discount equal to the items' sum (what the quote shows as 'before discount')", () => {
    const t = quoteTotals(4321.5, { type: "percent", value: 12.5 }, VAT);
    expect(t.subtotal + t.discountAmount).toBeCloseTo(t.itemsSum, 2);
    expect(t.total).toBeCloseTo(t.subtotal + t.vatAmount, 2);
  });
});

describe("toQuoteDiscount", () => {
  it("is null when nothing was taken off", () => {
    expect(toQuoteDiscount("amount", 0, 0)).toBeNull();
    expect(toQuoteDiscount("percent", 10, 0)).toBeNull();
  });

  it("carries the type, the typed value and the shekels taken off", () => {
    expect(toQuoteDiscount("percent", 10, 500)).toEqual({ type: "percent", value: 10, amount: 500 });
    expect(toQuoteDiscount("amount", 250, 250)).toEqual({ type: "amount", value: 250, amount: 250 });
  });
});

describe("readQuoteDiscount", () => {
  it("reads a well-formed discount back", () => {
    expect(readQuoteDiscount({ type: "percent", value: 10, amount: 500 })).toEqual({ type: "percent", value: 10, amount: 500 });
  });

  it("turns numeric strings from JSON into numbers", () => {
    expect(readQuoteDiscount({ type: "amount", value: "250", amount: "250" })).toEqual({ type: "amount", value: 250, amount: 250 });
  });

  it("drops anything else", () => {
    expect(readQuoteDiscount(null)).toBeNull();
    expect(readQuoteDiscount(undefined)).toBeNull();
    expect(readQuoteDiscount("10%")).toBeNull();
    expect(readQuoteDiscount(500)).toBeNull();
    expect(readQuoteDiscount({})).toBeNull();
    expect(readQuoteDiscount({ type: "fixed", value: 10, amount: 10 })).toBeNull();
    expect(readQuoteDiscount({ type: "amount", value: 0, amount: 0 })).toBeNull();
    expect(readQuoteDiscount({ type: "percent", value: 10, amount: 0 })).toBeNull();
    expect(readQuoteDiscount({ type: "percent", value: "abc", amount: 100 })).toBeNull();
  });

  it("round-trips what toQuoteDiscount saves", () => {
    const { discountAmount: amount } = quoteTotals(3200, { type: "percent", value: 5 }, VAT);
    const saved = toQuoteDiscount("percent", 5, amount);
    expect(readQuoteDiscount(JSON.parse(JSON.stringify(saved)))).toEqual({ type: "percent", value: 5, amount: 160 });
  });
});
