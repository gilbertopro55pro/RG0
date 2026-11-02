import { describe, expect, it } from "vitest";
import { legPayments, receivedOnLeg, revenueEntries, undoPaymentPatch } from "./paymentLog";

const base = {
  event_id: "e1",
  deposit_amount: 1000,
  deposit_paid: false,
  deposit_paid_amount: null,
  deposit_paid_at: null,
  balance_amount: 4000,
  balance_paid: false,
  balance_paid_amount: null,
  balance_paid_at: null,
};

describe("legPayments", () => {
  it("reads the list of payments, oldest first", () => {
    const p = {
      ...base,
      balance_paid: true,
      balance_paid_at: "2026-11-02T10:00:00+00:00",
      balance_payments: [
        { amount: 3500, at: "2026-10-15T09:00:00+00:00" },
        { amount: 500, at: "2026-11-02T10:00:00+00:00" },
      ],
    };
    expect(receivedOnLeg(p, "balance")).toBe(4000);
    expect(legPayments(p, "balance")).toEqual([
      { amount: 3500, at: "2026-10-15T09:00:00+00:00" },
      { amount: 500, at: "2026-11-02T10:00:00+00:00" },
    ]);
  });

  it("counts a row without the list as before: everything received, on the paid date", () => {
    const p = { ...base, balance_paid_amount: 3500, balance_paid_at: "2026-10-15T09:00:00+00:00" };
    expect(legPayments(p, "balance")).toEqual([{ amount: 3500, at: "2026-10-15T09:00:00+00:00" }]);
    // A list that doesn't add up to what was received isn't trusted.
    expect(legPayments({ ...p, balance_payments: [{ amount: 100, at: "2026-10-01T00:00:00Z" }] }, "balance")).toEqual([
      { amount: 3500, at: "2026-10-15T09:00:00+00:00" },
    ]);
  });

  it("has nothing for an unpaid leg, or one received without a date and no list", () => {
    expect(legPayments(base, "balance")).toEqual([]);
    expect(legPayments({ ...base, deposit_paid: true }, "deposit")).toEqual([]);
    // A leftover list on an unpaid leg doesn't count.
    expect(legPayments({ ...base, balance_payments: [{ amount: 500, at: "2026-10-01T00:00:00Z" }] }, "balance")).toEqual([]);
  });

  it("skips broken entries", () => {
    const p = {
      ...base,
      deposit_paid: true,
      deposit_paid_at: "2026-10-01T00:00:00Z",
      deposit_payments: [{ amount: 1000, at: "2026-10-01T00:00:00Z" }, { amount: 0, at: "2026-10-02T00:00:00Z" }, { amount: 5, at: "nope" }, null],
    };
    expect(legPayments(p, "deposit")).toEqual([{ amount: 1000, at: "2026-10-01T00:00:00Z" }]);
  });
});

describe("revenueEntries", () => {
  it("puts the partial payment in its month and the completion in its own", () => {
    const rows = revenueEntries([
      {
        ...base,
        deposit_paid: true,
        deposit_paid_at: "2026-09-01T00:00:00Z",
        deposit_payments: [{ amount: 1000, at: "2026-09-01T00:00:00Z" }],
        balance_paid: true,
        balance_paid_at: "2026-11-02T10:00:00Z",
        balance_payments: [
          { amount: 3500, at: "2026-10-15T09:00:00Z" },
          { amount: 500, at: "2026-11-02T10:00:00Z" },
        ],
      },
    ]);
    expect(rows.map((r) => [r.field, r.amount, r.at.slice(0, 7), r.kind])).toEqual([
      ["deposit", 1000, "2026-09", "full"],
      ["balance", 3500, "2026-10", "partial"],
      ["balance", 500, "2026-11", "completion"],
    ]);
  });

  it("marks every payment of a leg that isn't paid in full yet as partial", () => {
    const rows = revenueEntries([
      { ...base, balance_paid_amount: 3800, balance_paid_at: "2026-11-01T00:00:00Z", balance_payments: [{ amount: 3500, at: "2026-10-15T00:00:00Z" }, { amount: 300, at: "2026-11-01T00:00:00Z" }] },
    ]);
    expect(rows.map((r) => r.kind)).toEqual(["partial", "partial"]);
    expect(rows.reduce((s, r) => s + r.amount, 0)).toBe(3800);
  });
});

describe("undoPaymentPatch", () => {
  it("undoes only the completion of a leg paid in parts", () => {
    const entries = [
      { amount: 3000, at: "2026-10-01T00:00:00Z" },
      { amount: 500, at: "2026-10-15T00:00:00Z" },
      { amount: 500, at: "2026-11-02T00:00:00Z" },
    ];
    expect(undoPaymentPatch("balance", true, entries)).toEqual({ balance_paid: false, balance_paid_at: "2026-10-15T00:00:00Z", balance_paid_amount: 3500 });
  });

  it("resets a leg paid at once, or a partial one, to unpaid", () => {
    const reset = { deposit_paid: false, deposit_paid_at: null, deposit_paid_amount: null };
    expect(undoPaymentPatch("deposit", true, [{ amount: 1000, at: "2026-10-01T00:00:00Z" }])).toEqual(reset);
    expect(undoPaymentPatch("deposit", false, [{ amount: 400, at: "2026-10-01T00:00:00Z" }, { amount: 100, at: "2026-10-02T00:00:00Z" }])).toEqual(reset);
    expect(undoPaymentPatch("deposit", true, [])).toEqual(reset);
  });
});
