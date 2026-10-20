import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LEAD_ARCHIVE_DAYS, LEAD_IDLE_DAYS, daysUntilPurge, runLeadRetention } from "@/lib/leadRetention";

const DAY = 86_400_000;
const ARCHIVED = "2026-10-01T03:00:00.000Z";
const at = (days: number) => Date.parse(ARCHIVED) + days * DAY;

describe("retention periods", () => {
  it("archives after 13 idle days and deletes 14 days later (about four weeks in all)", () => {
    expect(LEAD_IDLE_DAYS).toBe(13);
    expect(LEAD_ARCHIVE_DAYS).toBe(14);
    expect(LEAD_IDLE_DAYS + 1 + LEAD_ARCHIVE_DAYS).toBe(28);
  });
});

describe("daysUntilPurge", () => {
  it("is 14 right after archiving", () => {
    expect(daysUntilPurge(ARCHIVED, at(0))).toBe(14);
    expect(daysUntilPurge(ARCHIVED, at(0) + 1)).toBe(14);
  });

  it("rounds a part of a day up", () => {
    expect(daysUntilPurge(ARCHIVED, at(1))).toBe(13);
    expect(daysUntilPurge(ARCHIVED, at(13.5))).toBe(1);
    expect(daysUntilPurge(ARCHIVED, at(14) - 1)).toBe(1);
  });

  it("is 0 once the archive period is over, never negative", () => {
    expect(daysUntilPurge(ARCHIVED, at(14))).toBe(0);
    expect(daysUntilPurge(ARCHIVED, at(30))).toBe(0);
  });
});

// A fake query builder: records each chained call, and answers per table and operation.
type Op = [string, ...unknown[]];
type Call = { table: string; ops: Op[] };
type Answer = { data: unknown; error: unknown };
function fakeSupabase(answer: (call: Call) => Answer) {
  const calls: Call[] = [];
  const client = {
    from(table: string) {
      const call: Call = { table, ops: [] };
      calls.push(call);
      const chain: object = new Proxy(
        {},
        {
          get(_t, prop: string) {
            if (prop === "then") return (resolve: (v: unknown) => void) => resolve(answer(call));
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
const has = (call: Call, op: string) => call.ops.some(([o]) => o === op);

describe("runLeadRetention", () => {
  const NOW = new Date("2026-10-20T02:00:00.000Z");
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("archives open, unconverted leads idle for 13 days, and deletes the ones archived 14 days ago with their conversations", async () => {
    const { client, calls } = fakeSupabase((call) => {
      if (call.table === "leads" && has(call, "update")) return { data: [{ id: "a1" }, { id: "a2" }], error: null };
      if (call.table === "leads" && has(call, "delete")) return { data: [{ id: "x1" }, { id: "x2" }], error: null };
      if (call.table === "leads") return { data: [{ id: "x1", bot_conversation_id: "c1" }, { id: "x2", bot_conversation_id: null }], error: null };
      return { data: null, error: null };
    });
    expect(await runLeadRetention(client)).toEqual({ archived: 2, purged: 2 });

    const [archive, expired, conversations, purge] = calls;
    expect(archive.table).toBe("leads");
    expect(archive.ops).toEqual([
      ["update", { archived_at: "2026-10-20T02:00:00.000Z" }],
      ["is", "archived_at", null],
      ["is", "converted_event_id", null],
      ["neq", "status", "won"],
      ["lt", "last_activity_at", "2026-10-07T02:00:00.000Z"],
      ["select", "id"],
    ]);
    expect(expired.ops).toContainEqual(["not", "archived_at", "is", null]);
    expect(expired.ops).toContainEqual(["is", "converted_event_id", null]);
    expect(expired.ops).toContainEqual(["lt", "archived_at", "2026-10-06T02:00:00.000Z"]);
    expect(conversations.table).toBe("bot_conversations");
    expect(conversations.ops).toEqual([["delete"], ["in", "id", ["c1"]]]);
    expect(purge.table).toBe("leads");
    expect(purge.ops).toEqual([["delete"], ["in", "id", ["x1", "x2"]], ["select", "id"]]);
  });

  it("deletes nothing when no lead has expired", async () => {
    const { client, calls } = fakeSupabase((call) => (has(call, "update") ? { data: [], error: null } : { data: [], error: null }));
    expect(await runLeadRetention(client)).toEqual({ archived: 0, purged: 0 });
    expect(calls).toHaveLength(2);
  });

  it("skips the conversations step when the expired leads had none", async () => {
    const { client, calls } = fakeSupabase((call) => {
      if (has(call, "update")) return { data: null, error: null };
      if (has(call, "delete")) return { data: [{ id: "x1" }], error: null };
      return { data: [{ id: "x1", bot_conversation_id: null }], error: null };
    });
    expect(await runLeadRetention(client)).toEqual({ archived: 0, purged: 1 });
    expect(calls.map((c) => c.table)).toEqual(["leads", "leads", "leads"]);
  });

  it("throws when a step fails", async () => {
    const boom = { message: "db down" };
    const archiveFails = fakeSupabase((call) => (has(call, "update") ? { data: null, error: boom } : { data: [], error: null }));
    await expect(runLeadRetention(archiveFails.client)).rejects.toBe(boom);
    const deleteFails = fakeSupabase((call) => {
      if (has(call, "delete")) return { data: null, error: boom };
      if (has(call, "update")) return { data: [], error: null };
      return { data: [{ id: "x1", bot_conversation_id: null }], error: null };
    });
    await expect(runLeadRetention(deleteFails.client)).rejects.toBe(boom);
  });
});
