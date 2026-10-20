import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { closingRecognitions, computeClosePreview, monthKeyIsrael, monthLabel, remainingBalance, resolveBalanceMonth, type ClosePreview } from "@/lib/closeEvent";

const leg = (balance_amount: number, balance_paid = false, balance_paid_amount: number | null = null) => ({
  balance_amount,
  balance_paid,
  balance_paid_amount,
});

describe("monthKeyIsrael", () => {
  it("buckets by the month in Israel, not UTC", () => {
    // 21:30 UTC on Sept 30 is 00:30 on Oct 1 in Israel (summer time, UTC+3).
    expect(monthKeyIsrael(new Date("2026-09-30T21:30:00Z"))).toBe("2026-10");
    expect(monthKeyIsrael(new Date("2026-09-30T20:30:00Z"))).toBe("2026-09");
    // New Year's Eve in winter time (UTC+2) rolls the year too.
    expect(monthKeyIsrael(new Date("2026-12-31T22:30:00Z"))).toBe("2027-01");
    expect(monthKeyIsrael(new Date("2026-12-31T21:30:00Z"))).toBe("2026-12");
  });
});

describe("monthLabel", () => {
  it("names the month in Hebrew", () => {
    expect(monthLabel("2026-10")).toBe("אוקטובר 2026");
    expect(monthLabel("2027-01")).toBe("ינואר 2027");
  });
});

describe("remainingBalance", () => {
  it("is the whole balance when nothing was paid", () => {
    expect(remainingBalance(leg(3000))).toBe(3000);
  });

  it("subtracts a partial payment", () => {
    expect(remainingBalance(leg(3000, false, 1200))).toBe(1800);
  });

  it("is zero once the balance is marked paid, whatever the partial amount says", () => {
    expect(remainingBalance(leg(3000, true, 1200))).toBe(0);
    expect(remainingBalance(leg(3000, true))).toBe(0);
  });

  it("never goes below zero when more than the balance was recorded", () => {
    expect(remainingBalance(leg(3000, false, 3500))).toBe(0);
  });

  it("is zero with no payment row", () => {
    expect(remainingBalance(null)).toBe(0);
    expect(remainingBalance(undefined)).toBe(0);
  });

  it("reads numeric strings (Postgres numeric) as numbers", () => {
    expect(remainingBalance({ balance_amount: "2500" as unknown as number, balance_paid: false, balance_paid_amount: "500" as unknown as number })).toBe(2000);
  });
});

describe("resolveBalanceMonth", () => {
  const preview = (p: Partial<ClosePreview>): ClosePreview => ({
    openStagesCount: 0,
    remaining: 1800,
    hasPartialPayment: false,
    createdMonth: "2026-08",
    closingMonth: "2026-10",
    needsMonthChoice: false,
    ...p,
  });

  it("recognizes nothing when nothing is owed", () => {
    expect(resolveBalanceMonth(preview({ remaining: 0 }), "created")).toEqual({ ok: true, month: null });
  });

  it("goes by the photographer's choice when one is needed", () => {
    expect(resolveBalanceMonth(preview({ needsMonthChoice: true }), "created")).toEqual({ ok: true, month: "2026-08" });
    expect(resolveBalanceMonth(preview({ needsMonthChoice: true }), "closing")).toEqual({ ok: true, month: "2026-10" });
  });

  it("refuses to close without the required choice", () => {
    expect(resolveBalanceMonth(preview({ needsMonthChoice: true }), undefined)).toEqual({ ok: false, error: "יש לבחור באיזה חודש להוסיף את היתרה" });
  });

  it("puts the remainder in the closing month when no choice is offered, ignoring a stray choice", () => {
    expect(resolveBalanceMonth(preview({ hasPartialPayment: true }), undefined)).toEqual({ ok: true, month: "2026-10" });
    expect(resolveBalanceMonth(preview({ hasPartialPayment: true }), "created")).toEqual({ ok: true, month: "2026-10" });
  });
});

describe("closingRecognitions", () => {
  const closed = (id: string, month: string | null = "2026-10") => ({ id, closed_at: "2026-10-15T10:00:00Z", closed_balance_month: month });

  it("recognizes what was left of the balance, in the month chosen at closing", () => {
    expect(closingRecognitions([closed("a", "2026-09")], [{ event_id: "a", ...leg(3000, false, 1000) }])).toEqual([
      { eventId: "a", month: "2026-09", amount: 2000 },
    ]);
  });

  it("counts only events that are closed and have a month (a restored event has neither)", () => {
    const events = [
      { id: "open", closed_at: null, closed_balance_month: null },
      { id: "restored", closed_at: null, closed_balance_month: "2026-10" },
      closed("noMonth", null),
      closed("ok"),
    ];
    const payments = ["open", "restored", "noMonth", "ok"].map((event_id) => ({ event_id, ...leg(1000) }));
    expect(closingRecognitions(events, payments)).toEqual([{ eventId: "ok", month: "2026-10", amount: 1000 }]);
  });

  it("skips an event with nothing left to recognize or no payment row", () => {
    expect(closingRecognitions([closed("paid"), closed("none")], [{ event_id: "paid", ...leg(1000, true) }])).toEqual([]);
  });
});

// A stand-in for the three reads computeClosePreview makes.
function fakeSupabase(data: {
  event: { id: string; created_at: string } | null;
  payment: ReturnType<typeof leg> | null;
  stages: { done: boolean }[];
}) {
  const result = (table: string) =>
    table === "events" ? data.event : table === "event_payments" ? data.payment : table === "event_stages" ? data.stages : null;
  const client = {
    from(table: string) {
      const q = {
        select: () => q,
        eq: () => q,
        maybeSingle: () => Promise.resolve({ data: result(table), error: null }),
        returns: () => Promise.resolve({ data: result(table), error: null }),
      };
      return q;
    },
  };
  return client as unknown as SupabaseClient;
}

describe("computeClosePreview", () => {
  const now = new Date("2026-10-20T09:00:00Z");

  it("asks which month gets the balance when nothing was paid and the event was saved in another month", async () => {
    const preview = await computeClosePreview(
      fakeSupabase({ event: { id: "e", created_at: "2026-08-10T12:00:00Z" }, payment: leg(3000), stages: [{ done: true }, { done: false }, { done: false }] }),
      "e",
      now
    );
    expect(preview).toEqual({
      openStagesCount: 2,
      remaining: 3000,
      hasPartialPayment: false,
      createdMonth: "2026-08",
      closingMonth: "2026-10",
      needsMonthChoice: true,
    });
  });

  it("offers no choice after a partial payment: the rest goes to the closing month", async () => {
    const preview = await computeClosePreview(
      fakeSupabase({ event: { id: "e", created_at: "2026-08-10T12:00:00Z" }, payment: leg(3000, false, 1000), stages: [] }),
      "e",
      now
    );
    expect(preview).toMatchObject({ remaining: 2000, hasPartialPayment: true, needsMonthChoice: false });
    expect(resolveBalanceMonth(preview!, undefined)).toEqual({ ok: true, month: "2026-10" });
  });

  it("offers no choice when the event was saved this month", async () => {
    const preview = await computeClosePreview(
      fakeSupabase({ event: { id: "e", created_at: "2026-10-02T12:00:00Z" }, payment: leg(3000), stages: [] }),
      "e",
      now
    );
    expect(preview).toMatchObject({ createdMonth: "2026-10", closingMonth: "2026-10", needsMonthChoice: false });
  });

  it("offers no choice when the balance is paid", async () => {
    const preview = await computeClosePreview(
      fakeSupabase({ event: { id: "e", created_at: "2026-08-10T12:00:00Z" }, payment: leg(3000, true), stages: [] }),
      "e",
      now
    );
    expect(preview).toMatchObject({ remaining: 0, needsMonthChoice: false });
    expect(resolveBalanceMonth(preview!, undefined)).toEqual({ ok: true, month: null });
  });

  it("is null for an event that doesn't exist", async () => {
    expect(await computeClosePreview(fakeSupabase({ event: null, payment: null, stages: [] }), "missing", now)).toBeNull();
  });
});
