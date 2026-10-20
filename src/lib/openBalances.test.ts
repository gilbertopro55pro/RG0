import { describe, expect, it } from "vitest";
import { closingRecognitions } from "@/lib/closeEvent";
import { openAmount, openBalances } from "@/lib/openBalances";
import type { EventPaymentRow } from "@/lib/types";

const TODAY = "2026-10-20";

function payment(event_id: string, p: Partial<EventPaymentRow> = {}): EventPaymentRow {
  return {
    event_id,
    deposit_amount: 1000,
    balance_amount: 4000,
    deposit_paid: false,
    balance_paid: false,
    balance_due_date: null,
    deposit_paid_at: null,
    balance_paid_at: null,
    deposit_document_url: null,
    balance_document_url: null,
    deposit_documented_amount: null,
    balance_documented_amount: null,
    deposit_paid_amount: null,
    balance_paid_amount: null,
    deposit_notes: null,
    balance_notes: null,
    ...p,
  };
}

const event = (id: string, event_date: string, client_name = `לקוח ${id}`) => ({ id, client_name, event_date });

describe("openAmount", () => {
  it("is the deposit plus the balance when nothing was paid", () => {
    expect(openAmount(payment("e"), false)).toEqual({ deposit: 1000, balance: 4000, total: 5000 });
  });

  it("subtracts partial payments on both legs", () => {
    expect(openAmount(payment("e", { deposit_paid_amount: 400, balance_paid_amount: 1500 }), false)).toEqual({
      deposit: 600,
      balance: 2500,
      total: 3100,
    });
  });

  it("drops a leg once it's marked paid", () => {
    expect(openAmount(payment("e", { deposit_paid: true }), false)).toEqual({ deposit: 0, balance: 4000, total: 4000 });
    expect(openAmount(payment("e", { deposit_paid: true, balance_paid: true }), false)).toEqual({ deposit: 0, balance: 0, total: 0 });
  });

  it("doesn't count a balance recognized at the closing (it's already income)", () => {
    expect(openAmount(payment("e", { balance_paid_amount: 1500 }), true)).toEqual({ deposit: 1000, balance: 0, total: 1000 });
  });

  it("never goes negative when more was recorded than the leg", () => {
    expect(openAmount(payment("e", { deposit_paid_amount: 1200, balance_paid_amount: 5000 }), false)).toEqual({ deposit: 0, balance: 0, total: 0 });
  });

  it("reads numeric strings (Postgres numeric) as numbers", () => {
    const p = payment("e", { deposit_amount: "1000" as unknown as number, deposit_paid_amount: "250" as unknown as number });
    expect(openAmount(p, false).deposit).toBe(750);
  });
});

describe("openBalances", () => {
  it("lists every client who still owes money, with the deposit and balance left", () => {
    const { rows, total } = openBalances(
      [event("a", "2026-11-05", "דנה")],
      [payment("a", { deposit_paid: true, balance_paid_amount: 1000, balance_due_date: "2026-11-01" })],
      new Set(),
      TODAY
    );
    expect(rows).toEqual([
      { eventId: "a", clientName: "דנה", eventDate: "2026-11-05", deposit: 0, balance: 3000, total: 3000, dueDate: "2026-11-01", held: false },
    ]);
    expect(total).toBe(3000);
  });

  it("leaves out clients who paid everything, and payments with no event", () => {
    const { rows, total } = openBalances(
      [event("paid", "2026-09-01"), event("owes", "2026-09-02")],
      [payment("paid", { deposit_paid: true, balance_paid: true }), payment("owes"), payment("orphan")],
      new Set(),
      TODAY
    );
    expect(rows.map((r) => r.eventId)).toEqual(["owes"]);
    expect(total).toBe(5000);
  });

  it("puts events that already took place first, oldest first, then the coming ones by date", () => {
    const events = [event("next", "2026-12-01"), event("old", "2026-07-01"), event("soon", "2026-10-25"), event("recent", "2026-10-19"), event("today", TODAY)];
    const { rows } = openBalances(events, events.map((e) => payment(e.id)), new Set(), TODAY);
    expect(rows.map((r) => [r.eventId, r.held])).toEqual([
      ["old", true],
      ["recent", true],
      ["today", false],
      ["soon", false],
      ["next", false],
    ]);
  });

  it("counts an event today as coming, not held (held = before today)", () => {
    const { rows, heldTotal } = openBalances([event("today", TODAY)], [payment("today")], new Set(), TODAY);
    expect(rows[0].held).toBe(false);
    expect(heldTotal).toBe(0);
  });

  it("totals all rows and, separately, the ones already held", () => {
    const events = [event("past1", "2026-08-01"), event("past2", "2026-09-15"), event("future", "2027-01-10")];
    const payments = [
      payment("past1", { deposit_paid: true, balance_paid_amount: 1500 }), // 2,500
      payment("past2", { deposit_paid_amount: 500 }), // 500 + 4,000
      payment("future", { deposit_amount: 2000, balance_amount: 6000 }), // 8,000
    ];
    const { total, heldTotal } = openBalances(events, payments, new Set(), TODAY);
    expect(total).toBe(2500 + 4500 + 8000);
    expect(heldTotal).toBe(2500 + 4500);
  });

  it("reads a timestamp event date by its day", () => {
    const { rows } = openBalances([event("a", "2026-10-19T18:00:00+03:00")], [payment("a")], new Set(), TODAY);
    expect(rows[0]).toMatchObject({ eventDate: "2026-10-19", held: true });
  });

  it("matches the dashboard's 'pending payment' rule: a balance recognized at closing isn't open", () => {
    const events = [
      { ...event("closed", "2026-09-01"), closed_at: "2026-09-10T10:00:00Z", closed_balance_month: "2026-09" },
      { ...event("open", "2026-09-02"), closed_at: null, closed_balance_month: null },
    ];
    const payments = [payment("closed", { deposit_paid: true, balance_paid_amount: 1000 }), payment("open", { deposit_paid: true })];
    const recognized = new Set(closingRecognitions(events, payments).map((r) => r.eventId));
    const { rows, total } = openBalances(events, payments, recognized, TODAY);
    expect(rows.map((r) => r.eventId)).toEqual(["open"]);
    expect(total).toBe(4000);
  });

  it("is empty with nothing owed", () => {
    expect(openBalances([], [], new Set(), TODAY)).toEqual({ rows: [], total: 0, heldTotal: 0 });
  });
});
