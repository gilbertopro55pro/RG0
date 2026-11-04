import { describe, expect, it } from "vitest";
import { israelMonthKey, receiptVat, reportingPeriod, showsVat, vatByReportingPeriod, vatIncluded, vatReceipts, vatTotal } from "@/lib/receiptVat";

describe("vatIncluded", () => {
  it("backs the VAT out of an amount that includes it", () => {
    expect(vatIncluded(1180)).toBe(180);
    expect(vatIncluded(3500)).toBe(533.9);
    expect(vatIncluded(1800)).toBe(274.58);
    expect(vatIncluded(0)).toBe(0);
    expect(vatIncluded(-5)).toBe(0);
  });

  it("only a licensed receipt carries VAT", () => {
    expect(receiptVat(1180, "licensed")).toBe(180);
    expect(receiptVat(1180, "exempt")).toBe(0);
  });
});

describe("israelMonthKey", () => {
  it("uses the Israel calendar: 23:30 UTC on Oct 31 is already November", () => {
    expect(israelMonthKey("2026-10-31T23:30:00Z")).toBe("2026-11");
    expect(israelMonthKey("2026-10-31T20:00:00Z")).toBe("2026-10");
    // Winter time (UTC+2): 22:30 UTC on Dec 31 is January.
    expect(israelMonthKey("2026-12-31T22:30:00Z")).toBe("2027-01");
  });
});

describe("vatReceipts and vatTotal", () => {
  const rows = [
    // Issued as פטור before the switch to מורשה.
    { created_at: "2026-09-10T08:00:00Z", amount: 2000, tax_status: "exempt" as const, vat_amount: 0 },
    { created_at: "2026-10-08T07:51:41Z", amount: "3500", tax_status: "licensed" as const, vat_amount: "533.90" },
    { created_at: "2026-10-16T14:14:02Z", amount: 3000, tax_status: "licensed" as const, vat_amount: 457.63 },
    { created_at: "2026-11-02T09:00:00Z", amount: 1180, tax_status: "licensed" as const, vat_amount: null },
    { created_at: "2026-11-03T09:00:00Z", amount: null, tax_status: "licensed" as const, vat_amount: null },
  ];
  const receipts = vatReceipts(rows);

  it("keeps the VAT stored on the receipt, computes it when missing, and drops rows without an amount", () => {
    expect(receipts).toEqual([
      { month: "2026-09", amount: 2000, vat: 0, licensed: false },
      { month: "2026-10", amount: 3500, vat: 533.9, licensed: true },
      { month: "2026-10", amount: 3000, vat: 457.63, licensed: true },
      { month: "2026-11", amount: 1180, vat: 180, licensed: true },
    ]);
  });

  it("totals a month: VAT, the gross, before VAT, and the count", () => {
    expect(vatTotal(receipts, new Set(["2026-10"]))).toEqual({ vat: 991.53, gross: 6500, net: 5508.47, count: 2, exemptCount: 0 });
  });

  it("receipts issued as פטור carry no VAT and are counted apart", () => {
    expect(vatTotal(receipts, new Set(["2026-09"]))).toEqual({ vat: 0, gross: 0, net: 0, count: 0, exemptCount: 1 });
  });

  it("totals a year", () => {
    expect(vatTotal(receipts, (m) => m.startsWith("2026-"))).toMatchObject({ vat: 1171.53, gross: 7680, count: 3, exemptCount: 1 });
  });

  it("lists the two-month reporting periods of a year that had receipts", () => {
    expect(vatByReportingPeriod(receipts, 2026).map((p) => [p.from, p.to, p.total.vat, p.total.exemptCount])).toEqual([
      [9, 10, 991.53, 1],
      [11, 12, 180, 0],
    ]);
  });
});

describe("reportingPeriod", () => {
  it("pairs the months for the two-month VAT report", () => {
    expect(reportingPeriod(2026, 10)).toMatchObject({ from: 9, to: 10 });
    expect(reportingPeriod(2026, 9)).toMatchObject({ from: 9, to: 10 });
    expect(reportingPeriod(2026, 1).months).toEqual(new Set(["2026-01", "2026-02"]));
    expect(reportingPeriod(2026, 12).months).toEqual(new Set(["2026-11", "2026-12"]));
  });
});

describe("showsVat", () => {
  it("shows for a licensed business, even before its first receipt", () => {
    expect(showsVat("licensed", [])).toBe(true);
  });

  it("hides for an exempt business, unless it once issued receipts with VAT (switched back)", () => {
    expect(showsVat("exempt", [])).toBe(false);
    expect(showsVat("exempt", [{ month: "2026-10", amount: 100, vat: 0, licensed: false }])).toBe(false);
    expect(showsVat("exempt", [{ month: "2026-10", amount: 1180, vat: 180, licensed: true }])).toBe(true);
  });
});
