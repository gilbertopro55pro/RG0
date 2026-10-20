import { describe, expect, it } from "vitest";
import { eventsConflict } from "@/lib/eventTime";

const r = (start: string | null, end: string | null) => ({ start, end });

describe("eventsConflict", () => {
  it("does not flag two events on the same date whose hours don't overlap", () => {
    expect(eventsConflict(r("09:00", "13:00"), r("19:00", "23:00"))).toBe(false);
    expect(eventsConflict(r("19:00", "23:00"), r("09:00", "13:00"))).toBe(false);
  });

  it("flags overlapping hours", () => {
    expect(eventsConflict(r("18:00", "23:00"), r("22:00", "02:00"))).toBe(true);
    expect(eventsConflict(r("10:00", "14:00"), r("11:00", "12:00"))).toBe(true);
    expect(eventsConflict(r("11:00", "12:00"), r("10:00", "14:00"))).toBe(true);
  });

  it("lets one event end exactly when the next starts", () => {
    expect(eventsConflict(r("10:00", "14:00"), r("14:00", "18:00"))).toBe(false);
    expect(eventsConflict(r("14:00", "18:00"), r("10:00", "14:00"))).toBe(false);
  });

  it("treats an end of 00:00 as midnight, not the start of the day", () => {
    expect(eventsConflict(r("19:00", "00:00"), r("09:00", "13:00"))).toBe(false);
    expect(eventsConflict(r("19:00", "00:00"), r("23:30", "00:30"))).toBe(true);
    expect(eventsConflict(r("19:00", "00:00"), r("17:00", "19:00"))).toBe(false);
  });

  it("treats an end before the start as crossing midnight", () => {
    // 20:00–01:30 runs to 25:30, so it overlaps a 23:00 start but not a morning event.
    expect(eventsConflict(r("20:00", "01:30"), r("23:00", "23:45"))).toBe(true);
    expect(eventsConflict(r("20:00", "01:30"), r("08:00", "12:00"))).toBe(false);
  });

  it("is the whole day when either side has no hours", () => {
    expect(eventsConflict(r(null, null), r("09:00", "10:00"))).toBe(true);
    expect(eventsConflict(r("09:00", "10:00"), r(null, null))).toBe(true);
    expect(eventsConflict(r("09:00", null), r("19:00", "23:00"))).toBe(true);
    expect(eventsConflict(r("09:00", "10:00"), r(null, "23:00"))).toBe(true);
    expect(eventsConflict(r(null, null), r(null, null))).toBe(true);
  });

  it("reads database times with seconds (HH:MM:SS)", () => {
    expect(eventsConflict(r("19:00:00", "23:00:00"), r("09:00:00", "13:00:00"))).toBe(false);
    expect(eventsConflict(r("19:00:00", "23:00:00"), r("22:30", "23:30"))).toBe(true);
  });

  it("is symmetric", () => {
    const pairs: [ReturnType<typeof r>, ReturnType<typeof r>][] = [
      [r("09:00", "13:00"), r("12:59", "15:00")],
      [r("20:00", "01:00"), r("00:30", "02:00")],
      [r("19:00", "00:00"), r("18:00", "19:00")],
      [r(null, null), r("10:00", "11:00")],
    ];
    for (const [a, b] of pairs) expect(eventsConflict(a, b)).toBe(eventsConflict(b, a));
  });
});
