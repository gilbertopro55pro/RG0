import { describe, expect, it } from "vitest";
import { isSnoozed, snoozeTime } from "./reminderSnooze";

const NOW = Date.parse("2026-11-07T10:00:00Z");

describe("snoozeTime", () => {
  it("an hour or three hours from now", () => {
    expect(snoozeTime({ remindMinutes: 60 }, NOW)).toBe(NOW + 3_600_000);
    expect(snoozeTime({ remindMinutes: 180 }, NOW)).toBe(NOW + 3 * 3_600_000);
    // The old 30 minutes still works for a window opened before the change.
    expect(snoozeTime({ remindMinutes: 30 }, NOW)).toBe(NOW + 1_800_000);
    expect(snoozeTime({ remindMinutes: 45 }, NOW)).toBeNull();
    expect(snoozeTime({ remindMinutes: "60" }, NOW)).toBe(NOW + 3_600_000);
    expect(snoozeTime({}, NOW)).toBeNull();
  });

  it("a chosen moment: not in the past, at most 90 days ahead", () => {
    expect(snoozeTime({ remindAt: "2026-11-08T07:30:00Z" }, NOW)).toBe(Date.parse("2026-11-08T07:30:00Z"));
    expect(snoozeTime({ remindAt: "2026-11-07T09:59:00Z" }, NOW)).toBeNull();
    expect(snoozeTime({ remindAt: "2027-03-01T10:00:00Z" }, NOW)).toBeNull();
    expect(snoozeTime({ remindAt: "tomorrow" }, NOW)).toBeNull();
    expect(snoozeTime({ remindAt: 5 }, NOW)).toBeNull();
  });
});

describe("isSnoozed", () => {
  it("hides a window until its time", () => {
    expect(isSnoozed("2026-11-07T11:00:00Z", NOW)).toBe(true);
    expect(isSnoozed("2026-11-07T09:00:00Z", NOW)).toBe(false);
    expect(isSnoozed(null, NOW)).toBe(false);
  });
});
