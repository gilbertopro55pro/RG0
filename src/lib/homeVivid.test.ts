import { afterEach, describe, expect, it, vi } from "vitest";
import { countBadge, eventNeedsAttention, homeHeaderCounts, onlyNewLeads, revenueSplit, stageTrack } from "@/lib/homeVivid";

const ev = (id: string, event_date: string, extra: { closed_at?: string | null; needs_review?: boolean } = {}) => ({
  id,
  event_date,
  closed_at: extra.closed_at ?? null,
  needs_review: extra.needs_review ?? false,
});

describe("eventNeedsAttention", () => {
  it("is on for an open balance, an unpaid deposit, an unsigned contract or an import to fill in", () => {
    expect(eventNeedsAttention(ev("a", "2026-10-30"), { openBalance: 500 })).toBe(true);
    expect(eventNeedsAttention(ev("a", "2026-10-30"), { depositDue: 300 })).toBe(true);
    expect(eventNeedsAttention(ev("a", "2026-10-30"), { contractPending: true })).toBe(true);
    expect(eventNeedsAttention(ev("a", "2026-10-30", { needs_review: true }), undefined)).toBe(true);
  });

  it("is off for an event with nothing open", () => {
    expect(eventNeedsAttention(ev("a", "2026-10-30"), undefined)).toBe(false);
    expect(eventNeedsAttention(ev("a", "2026-10-30"), {})).toBe(false);
    expect(eventNeedsAttention(ev("a", "2026-10-30"), { openBalance: 0, depositDue: 0, contractPending: false })).toBe(false);
  });

  it("is never on for a closed event", () => {
    expect(eventNeedsAttention(ev("a", "2026-10-01", { closed_at: "2026-10-05T10:00:00Z", needs_review: true }), { openBalance: 900 })).toBe(false);
  });
});

describe("homeHeaderCounts", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  const events = [
    ev("past", "2026-10-20"),
    ev("today", "2026-10-21"),
    ev("closedToday", "2026-10-21", { closed_at: "2026-10-21T08:00:00Z" }),
    ev("in7", "2026-10-28"),
    ev("in8", "2026-10-29"),
    ev("review", "2026-12-01", { needs_review: true }),
  ];
  const attention = { past: { openBalance: 1200 }, in8: { depositDue: 500 }, closedToday: { openBalance: 100 } };

  it("counts the coming week by the Israeli date, whatever the status, and what needs attention", () => {
    // 12:00 in Israel on Oct 21.
    expect(homeHeaderCounts(events, attention, new Date("2026-10-21T09:00:00Z"))).toEqual({ week: 3, attention: 3 });
  });

  it("moves to the next day at midnight in Israel, not at midnight UTC", () => {
    // 00:30 in Israel on Oct 22 (21:30 UTC on the 21st): "today" and "closedToday" are now behind,
    // and Oct 29 is a week away.
    expect(homeHeaderCounts(events, attention, new Date("2026-10-21T21:30:00Z"))).toEqual({ week: 2, attention: 3 });
    // 23:59 in Israel on Oct 21.
    expect(homeHeaderCounts(events, attention, new Date("2026-10-21T20:59:00Z"))).toEqual({ week: 3, attention: 3 });
  });

  it("gives the same answer on a device in another time zone", () => {
    const tz = process.env.TZ;
    process.env.TZ = "America/Los_Angeles";
    try {
      vi.useFakeTimers();
      // Still Oct 21 in Los Angeles (14:30), already Oct 22 in Israel.
      vi.setSystemTime(new Date("2026-10-21T21:30:00Z"));
      expect(homeHeaderCounts(events, attention)).toEqual({ week: 2, attention: 3 });
      expect(new Date().getDate()).toBe(21);
    } finally {
      process.env.TZ = tz;
    }
  });

  it("uses the current time by default", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-21T09:00:00Z"));
    expect(homeHeaderCounts(events, attention)).toEqual({ week: 3, attention: 3 });
  });

  it("is zero for no events", () => {
    expect(homeHeaderCounts([], {}, new Date("2026-10-21T09:00:00Z"))).toEqual({ week: 0, attention: 0 });
  });
});

describe("stageTrack", () => {
  it("marks the done stages, the next one, and says which stage the event is at", () => {
    const stages = [true, true, true, false, false, false, false, false].map((done, i) => ({ done, stage_order: i }));
    expect(stageTrack(stages)).toEqual({
      total: 8,
      current: 4,
      segments: ["done", "done", "done", "next", "todo", "todo", "todo", "todo"],
    });
  });

  it("goes by stage_order, not by the order the rows came in", () => {
    const stages = [
      { done: false, stage_order: 3 },
      { done: true, stage_order: 1 },
      { done: false, stage_order: 2 },
    ];
    expect(stageTrack(stages)).toEqual({ total: 3, current: 2, segments: ["done", "next", "todo"] });
  });

  it("keeps a later stage that was marked early as done", () => {
    const stages = [
      { done: true, stage_order: 0 },
      { done: false, stage_order: 1 },
      { done: true, stage_order: 2 },
    ];
    expect(stageTrack(stages)).toEqual({ total: 3, current: 2, segments: ["done", "next", "done"] });
  });

  it("has no current stage once all are done, and nothing without stages", () => {
    expect(stageTrack([{ done: true, stage_order: 0 }, { done: true, stage_order: 1 }])).toEqual({ total: 2, current: null, segments: ["done", "done"] });
    expect(stageTrack([])).toBeNull();
    expect(stageTrack(null)).toBeNull();
    expect(stageTrack(undefined)).toBeNull();
  });

  it("starts at stage 1 when nothing is done", () => {
    expect(stageTrack([{ done: false, stage_order: 0 }, { done: false, stage_order: 1 }])?.current).toBe(1);
  });
});

describe("countBadge", () => {
  it("shows nothing at zero", () => {
    expect(countBadge(0)).toBeNull();
    expect(countBadge(null)).toBeNull();
    expect(countBadge(undefined)).toBeNull();
    expect(countBadge(-2)).toBeNull();
  });

  it("shows the count, capped at 99+", () => {
    expect(countBadge(1)).toBe("1");
    expect(countBadge(99)).toBe("99");
    expect(countBadge(100)).toBe("99+");
  });
});

describe("onlyNewLeads", () => {
  it("keeps leads in status new that aren't archived", () => {
    const calls: string[] = [];
    const query = {
      eq(column: string, value: string) {
        calls.push(`eq ${column}=${value}`);
        return query;
      },
      is(column: string, value: null) {
        calls.push(`is ${column}=${value}`);
        return query;
      },
    };
    expect(onlyNewLeads(query)).toBe(query);
    expect(calls).toEqual(["eq status=new", "is archived_at=null"]);
  });
});

describe("revenueSplit", () => {
  it("splits the bar into received and still expected", () => {
    expect(revenueSplit(18450, 24650)).toEqual({ receivedPct: (18450 / 24650) * 100, expectedPct: 100 - (18450 / 24650) * 100, stillDue: 6200 });
  });

  it("is a full received bar when everything expected came in", () => {
    expect(revenueSplit(5000, 5000)).toEqual({ receivedPct: 100, expectedPct: 0, stillDue: 0 });
  });

  it("is empty when nothing is expected this month", () => {
    expect(revenueSplit(0, 0)).toEqual({ receivedPct: 0, expectedPct: 0, stillDue: 0 });
  });

  it("is all expected when nothing came in yet", () => {
    expect(revenueSplit(0, 3000)).toEqual({ receivedPct: 0, expectedPct: 100, stillDue: 3000 });
  });
});
