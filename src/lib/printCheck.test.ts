import { describe, expect, it } from "vitest";
import { PRINT_CHECK_DAY_OPTIONS, isPrintCheckDays, latestPrintSendByEvent, printSentDate } from "@/lib/printCheck";

// Sent to the print house (owner, 2026-10-27).

describe("the check-with-the-print-house days", () => {
  it("3 to 14 days", () => {
    expect(PRINT_CHECK_DAY_OPTIONS[0]).toBe(3);
    expect(PRINT_CHECK_DAY_OPTIONS.at(-1)).toBe(14);
    expect(isPrintCheckDays(5)).toBe(true);
    expect(isPrintCheckDays(2)).toBe(false);
    expect(isPrintCheckDays(15)).toBe(false);
    expect(isPrintCheckDays("5")).toBe(false);
  });
});

describe("latestPrintSendByEvent", () => {
  it("the latest send per event; a gallery without an event is skipped", () => {
    expect(
      latestPrintSendByEvent([
        { created_at: "2026-10-20T08:00:00Z", gallery: { event_id: "a" } },
        { created_at: "2026-10-25T08:00:00Z", gallery: [{ event_id: "a" }] },
        { created_at: "2026-10-22T08:00:00Z", gallery: { event_id: "b" } },
        { created_at: "2026-10-26T08:00:00Z", gallery: { event_id: null } },
        { created_at: "2026-10-26T08:00:00Z", gallery: null },
      ])
    ).toEqual({ a: "2026-10-25T08:00:00Z", b: "2026-10-22T08:00:00Z" });
  });
});

describe("printSentDate", () => {
  it("Israel's date, also for a send late at night UTC", () => {
    expect(printSentDate("2026-10-26T22:30:00Z", "he-IL")).toBe("27.10.2026");
    expect(printSentDate("2026-10-27T08:00:00Z", "he-IL")).toBe("27.10.2026");
  });
});
