import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { formatDateDMY, formatWorkHours, quoteEventDetails } from "@/lib/priceQuoteFormat";

// formatDateDMY reads the date in local time. Pinned to Israel time (the photographers' browsers),
// so the result doesn't depend on the machine running the tests.
beforeAll(() => {
  vi.stubEnv("TZ", "Asia/Jerusalem");
});
afterAll(() => {
  vi.unstubAllEnvs();
});

describe("formatDateDMY", () => {
  it("formats a stored date as DD.MM.YYYY with leading zeros", () => {
    expect(formatDateDMY("2026-10-20")).toBe("20.10.2026");
    expect(formatDateDMY("2027-03-05")).toBe("05.03.2027");
  });

  it("reads a timestamp in Israel time", () => {
    // 22:30 UTC on Sept 30 is already Oct 1 in Israel (UTC+3).
    expect(formatDateDMY("2026-09-30T22:30:00Z")).toBe("01.10.2026");
  });

  it("is empty for a value that isn't a date", () => {
    expect(formatDateDMY("")).toBe("");
    expect(formatDateDMY("not a date")).toBe("");
  });
});

describe("formatWorkHours", () => {
  it("trims Postgres times to HH:MM", () => {
    expect(formatWorkHours("19:00:00", "23:30:00")).toBe("19:00-23:30");
    expect(formatWorkHours("13:00", "00:30")).toBe("13:00-00:30");
  });

  it("is empty unless both ends are known", () => {
    expect(formatWorkHours(null, "23:00:00")).toBe("");
    expect(formatWorkHours("19:00:00", null)).toBe("");
    expect(formatWorkHours(null, null)).toBe("");
  });
});

describe("quoteEventDetails", () => {
  it("gives the event's type, date, place and hours for the quote", () => {
    expect(
      quoteEventDetails({
        event_type: " חתונה ",
        event_date: "2027-06-12",
        event_location: " אולם הגן ",
        work_start_time: "19:00:00",
        work_end_time: "00:00:00",
      })
    ).toEqual({ type: "חתונה", date: "12.06.2027", location: "אולם הגן", workHours: "19:00-00:00" });
  });

  it("leaves out what's missing or blank", () => {
    expect(
      quoteEventDetails({ event_type: "  ", event_date: null, event_location: null, work_start_time: "19:00:00", work_end_time: null })
    ).toEqual({ type: undefined, date: undefined, location: undefined, workHours: undefined });
  });
});
