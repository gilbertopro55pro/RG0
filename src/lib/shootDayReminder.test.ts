import { afterEach, describe, expect, it, vi } from "vitest";
import { addDaysIso, daysBetweenIso, israelTodayIso, shootDayReminderDue, type ShootDayCandidate } from "@/lib/shootDayReminder";

// The reminder 3 days before the event to send the "יום הצילום" message (owner, 2026-10-22).
const event = (o: Partial<ShootDayCandidate> = {}): ShootDayCandidate => ({
  event_date: "2026-10-25",
  client_phone: "050-1234567",
  is_freelance: false,
  needs_review: false,
  closed_at: null,
  event_stages: [
    { stage_key: "event_closing", done: true },
    { stage_key: "shoot_day", done: false },
  ],
  ...o,
});

describe("shootDayReminderDue", () => {
  it("is due 3 days before, and up to the day before for an event booked late", () => {
    expect(shootDayReminderDue(event(), "2026-10-22", [], false)).toBe(true);
    expect(shootDayReminderDue(event(), "2026-10-24", [], false)).toBe(true);
  });

  it("never on the day itself, after it, or more than 3 days ahead", () => {
    expect(shootDayReminderDue(event(), "2026-10-25", [], false)).toBe(false);
    expect(shootDayReminderDue(event(), "2026-10-26", [], false)).toBe(false);
    expect(shootDayReminderDue(event(), "2026-10-21", [], false)).toBe(false);
  });

  it("comes once per event date: a reminder from this window counts whatever its answer was", () => {
    expect(shootDayReminderDue(event(), "2026-10-23", ["2026-10-22T09:00:12.000Z"], false)).toBe(false);
  });

  it("comes again when the event moved to a later date", () => {
    expect(shootDayReminderDue(event({ event_date: "2026-11-08" }), "2026-11-05", ["2026-10-22T09:00:12.000Z"], false)).toBe(true);
  });

  it("skips an event with no client phone, a freelance job, an unverified import or a closed event", () => {
    expect(shootDayReminderDue(event({ client_phone: null }), "2026-10-22", [], false)).toBe(false);
    expect(shootDayReminderDue(event({ client_phone: "  " }), "2026-10-22", [], false)).toBe(false);
    expect(shootDayReminderDue(event({ is_freelance: true }), "2026-10-22", [], false)).toBe(false);
    expect(shootDayReminderDue(event({ needs_review: true }), "2026-10-22", [], false)).toBe(false);
    expect(shootDayReminderDue(event({ closed_at: "2026-10-20T10:00:00Z" }), "2026-10-22", [], false)).toBe(false);
  });

  it("skips a package without a shoot day stage, or one already marked", () => {
    expect(shootDayReminderDue(event({ event_stages: [] }), "2026-10-22", [], false)).toBe(false);
    expect(shootDayReminderDue(event({ event_stages: [{ stage_key: "shoot_day", done: true }] }), "2026-10-22", [], false)).toBe(false);
  });

  it("skips when the photographer already sent the shoot day message by hand", () => {
    expect(shootDayReminderDue(event(), "2026-10-22", [], true)).toBe(false);
  });
});

describe("dates", () => {
  afterEach(() => vi.useRealTimers());

  it("adds and counts days across a month end and the clock change", () => {
    expect(addDaysIso("2026-10-30", 3)).toBe("2026-11-02");
    expect(addDaysIso("2026-10-25", -4)).toBe("2026-10-21");
    expect(daysBetweenIso("2026-10-23", "2026-10-26")).toBe(3);
    expect(daysBetweenIso("2027-03-24", "2027-03-27")).toBe(3);
  });

  it("takes today in Israel, not the server's date", () => {
    vi.useFakeTimers();
    // 22:30 UTC on the 21st is already the 22nd in Israel (UTC+3 until the end of October).
    vi.setSystemTime(new Date("2026-10-21T22:30:00Z"));
    expect(israelTodayIso()).toBe("2026-10-22");
    vi.setSystemTime(new Date("2026-10-22T09:00:00Z"));
    expect(israelTodayIso()).toBe("2026-10-22");
  });
});
