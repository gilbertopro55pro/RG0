import { describe, expect, it, vi } from "vitest";
import { CONTACT_REMINDER_COLUMNS, CONTACT_REMIND_MAX_DAYS, validContactRemindAt, type DueContactReminder } from "@/lib/leadContactReminder";

const NOW = Date.parse("2026-10-20T09:00:00.000Z");
const DAY = 86_400_000;

describe("validContactRemindAt", () => {
  it("accepts a moment in the future and returns it as UTC ISO", () => {
    // Tomorrow 10:00 Israel time (UTC+3 until the end of October).
    expect(validContactRemindAt("2026-10-21T10:00:00+03:00", NOW)).toBe("2026-10-21T07:00:00.000Z");
    expect(validContactRemindAt("2026-10-21T07:00:00Z", NOW)).toBe("2026-10-21T07:00:00.000Z");
  });

  it("reads Israel winter time after the clocks go back", () => {
    expect(validContactRemindAt("2026-10-27T10:00:00+02:00", NOW)).toBe("2026-10-27T08:00:00.000Z");
  });

  it("allows up to a minute in the past for clock skew, not more", () => {
    expect(validContactRemindAt(new Date(NOW - 60_000).toISOString(), NOW)).toBe(new Date(NOW - 60_000).toISOString());
    expect(validContactRemindAt(new Date(NOW - 60_001).toISOString(), NOW)).toBeNull();
    expect(validContactRemindAt("2026-10-19T09:00:00Z", NOW)).toBeNull();
  });

  it("allows up to a year ahead, not more", () => {
    expect(CONTACT_REMIND_MAX_DAYS).toBe(365);
    expect(validContactRemindAt(new Date(NOW + 365 * DAY).toISOString(), NOW)).toBe(new Date(NOW + 365 * DAY).toISOString());
    expect(validContactRemindAt(new Date(NOW + 365 * DAY + 1).toISOString(), NOW)).toBeNull();
  });

  it("rejects anything that isn't a date string", () => {
    for (const v of [null, undefined, 0, NOW + DAY, {}, "", "tomorrow", "2026-13-40T10:00:00Z"]) {
      expect(validContactRemindAt(v, NOW)).toBeNull();
    }
  });

  it("uses the current time by default", () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(NOW);
      expect(validContactRemindAt("2026-10-20T09:30:00Z")).toBe("2026-10-20T09:30:00.000Z");
      expect(validContactRemindAt("2026-10-20T08:58:00Z")).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("CONTACT_REMINDER_COLUMNS", () => {
  it("reads every field a due reminder shows", () => {
    const due: DueContactReminder = {
      id: "l1",
      name: "Dana",
      phone: null,
      event_type_name: null,
      event_date_interest: null,
      notes: null,
      contact_remind_at: "2026-10-21T07:00:00.000Z",
    };
    expect(CONTACT_REMINDER_COLUMNS.split(",").map((c) => c.trim()).sort()).toEqual(Object.keys(due).sort());
  });
});
