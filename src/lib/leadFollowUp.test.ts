import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  FOLLOW_UP_LEAD_COLUMNS,
  QUOTE_FOLLOWUP_REMIND_MAX_DAYS,
  QUOTE_FOLLOWUP_REMIND_MINUTES,
  cancelLeadFollowUps,
  leadQuoteFollowUpMessage,
  quoteFollowUpHandled,
  scheduleLeadFollowUps,
  scheduleLeadQuoteFollowUp,
  type FollowUpLeadState,
} from "@/lib/leadFollowUp";

// A fake query builder: records each chained call per table, and answers with the table's data.
type Op = [string, ...unknown[]];
type Call = { table: string; ops: Op[] };
function fakeSupabase(tables: Record<string, unknown> = {}) {
  const calls: Call[] = [];
  const client = {
    from(table: string) {
      const call: Call = { table, ops: [] };
      calls.push(call);
      const chain: object = new Proxy(
        {},
        {
          get(_t, prop: string) {
            if (prop === "then") return (resolve: (v: unknown) => void) => resolve({ data: tables[table] ?? null, error: null });
            return (...args: unknown[]) => {
              call.ops.push([prop, ...args]);
              return chain;
            };
          },
        },
      );
      return chain;
    },
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { client: client as any, calls };
}

const open = (over: Partial<FollowUpLeadState> = {}): FollowUpLeadState => ({
  status: "quoted",
  archived_at: null,
  converted_event_id: null,
  quote_approved_at: null,
  last_activity_at: "2026-10-15T08:00:00.000Z",
  ...over,
});

const REMIND_SET = "2026-10-16T10:00:00.000Z";

describe("quoteFollowUpHandled", () => {
  it("is handled when the lead is gone", () => {
    expect(quoteFollowUpHandled(null, null)).toBe(true);
    expect(quoteFollowUpHandled(null, REMIND_SET)).toBe(true);
  });

  it("is handled once the lead moved on: won, lost, archived, booked or approved", () => {
    expect(quoteFollowUpHandled(open({ status: "won" }), null)).toBe(true);
    expect(quoteFollowUpHandled(open({ status: "lost" }), null)).toBe(true);
    expect(quoteFollowUpHandled(open({ archived_at: "2026-10-17T00:00:00Z" }), null)).toBe(true);
    expect(quoteFollowUpHandled(open({ converted_event_id: "ev1" }), null)).toBe(true);
    expect(quoteFollowUpHandled(open({ quote_approved_at: "2026-10-16T12:00:00Z" }), null)).toBe(true);
  });

  it("is open for a quoted or contacted lead without a reminder", () => {
    expect(quoteFollowUpHandled(open(), null)).toBe(false);
    expect(quoteFollowUpHandled(open({ status: "contacted", last_activity_at: "2026-10-19T00:00:00Z" }), null)).toBe(false);
    expect(quoteFollowUpHandled(open({ status: null }), null)).toBe(false);
  });

  it("is handled when anything happened on the lead after the reminder was set", () => {
    expect(quoteFollowUpHandled(open({ last_activity_at: "2026-10-16T10:00:00.001Z" }), REMIND_SET)).toBe(true);
    expect(quoteFollowUpHandled(open({ last_activity_at: "2026-10-18T09:00:00Z" }), REMIND_SET)).toBe(true);
  });

  it("stays open when the last activity is the reminder itself or earlier", () => {
    expect(quoteFollowUpHandled(open({ last_activity_at: REMIND_SET }), REMIND_SET)).toBe(false);
    expect(quoteFollowUpHandled(open({ last_activity_at: "2026-10-16T09:59:59Z" }), REMIND_SET)).toBe(false);
    expect(quoteFollowUpHandled(open({ last_activity_at: null }), REMIND_SET)).toBe(false);
  });

  it("compares moments, not strings (offsets)", () => {
    // 12:30+03:00 is 09:30Z, before the reminder at 10:00Z.
    expect(quoteFollowUpHandled(open({ last_activity_at: "2026-10-16T12:30:00+03:00" }), REMIND_SET)).toBe(false);
    // 13:30+03:00 is 10:30Z, after it.
    expect(quoteFollowUpHandled(open({ last_activity_at: "2026-10-16T13:30:00+03:00" }), REMIND_SET)).toBe(true);
  });

  it("reads exactly the columns it needs", () => {
    const cols = FOLLOW_UP_LEAD_COLUMNS.split(",").map((c) => c.trim()).sort();
    expect(cols).toEqual(Object.keys(open()).sort());
  });
});

describe("the reminder options on the quote follow-up", () => {
  it("offers 30 minutes, an hour, or a date up to 90 days ahead", () => {
    expect([...QUOTE_FOLLOWUP_REMIND_MINUTES]).toEqual([30, 60]);
    expect(QUOTE_FOLLOWUP_REMIND_MAX_DAYS).toBe(90);
  });
});

describe("leadQuoteFollowUpMessage", () => {
  it("greets the lead and asks about the quote", () => {
    expect(leadQuoteFollowUpMessage("דנה", null)).toBe("שלום דנה,\nשלחתי אלייך הצעת מחיר ואשמח לשמוע אם יש שאלות או שתרצו לתאם את תאריך האירוע.");
  });

  it("adds the signature as its own paragraph, trimmed", () => {
    expect(leadQuoteFollowUpMessage("דנה", "  סטודיו אור  ")).toBe(
      "שלום דנה,\nשלחתי אלייך הצעת מחיר ואשמח לשמוע אם יש שאלות או שתרצו לתאם את תאריך האירוע.\n\nסטודיו אור",
    );
    expect(leadQuoteFollowUpMessage("דנה", "   ")).not.toContain("\n\n");
    expect(leadQuoteFollowUpMessage("דנה", undefined)).not.toContain("\n\n");
  });
});

describe("scheduling the follow-ups", () => {
  // Mid-January: no daylight-saving change in any timezone over the next 10 days, so the local
  // date arithmetic gives whole 24-hour days wherever the tests run.
  const NOW = new Date("2027-01-10T09:00:00.000Z");
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("schedules the three lead steps at 2, 5 and 10 days when follow-ups are on", async () => {
    const { client, calls } = fakeSupabase({ photographers: { lead_follow_up_enabled: true } });
    await scheduleLeadFollowUps(client, "lead1", "ph1");
    const insert = calls.find((c) => c.table === "scheduled_messages")!.ops.find(([op]) => op === "insert")!;
    expect(insert[1]).toEqual([
      { lead_id: "lead1", kind: "lead_follow_up", sequence_step: 1, send_at: "2027-01-12T09:00:00.000Z" },
      { lead_id: "lead1", kind: "lead_follow_up", sequence_step: 2, send_at: "2027-01-15T09:00:00.000Z" },
      { lead_id: "lead1", kind: "lead_follow_up", sequence_step: 3, send_at: "2027-01-20T09:00:00.000Z" },
    ]);
  });

  it("schedules nothing when follow-ups are off or the photographer is missing", async () => {
    for (const row of [{ lead_follow_up_enabled: false }, null]) {
      const { client, calls } = fakeSupabase({ photographers: row });
      await scheduleLeadFollowUps(client, "lead1", "ph1");
      expect(calls.map((c) => c.table)).toEqual(["photographers"]);
    }
  });

  it("moves the quote nudge: cancels the pending one, then adds one two days out", async () => {
    const { client, calls } = fakeSupabase();
    await scheduleLeadQuoteFollowUp(client, "lead1");
    expect(calls).toHaveLength(2);
    expect(calls[0].ops).toEqual([
      ["update", { status: "canceled" }],
      ["eq", "lead_id", "lead1"],
      ["eq", "kind", "lead_quote_followup"],
      ["eq", "status", "pending"],
    ]);
    expect(calls[1].ops).toEqual([["insert", { lead_id: "lead1", kind: "lead_quote_followup", send_at: "2027-01-12T09:00:00.000Z" }]]);
  });

  it("cancels both kinds of pending follow-up for a lead", async () => {
    const { client, calls } = fakeSupabase();
    await cancelLeadFollowUps(client, "lead1");
    expect(calls).toHaveLength(1);
    expect(calls[0].table).toBe("scheduled_messages");
    expect(calls[0].ops).toEqual([
      ["update", { status: "canceled" }],
      ["eq", "lead_id", "lead1"],
      ["in", "kind", ["lead_follow_up", "lead_quote_followup"]],
      ["eq", "status", "pending"],
    ]);
  });
});
