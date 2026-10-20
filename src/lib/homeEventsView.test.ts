import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_HOME_VIEW, HOME_SORT_ORDERS, HOME_STATUS_FILTERS, comingWeekRange, parseHomeEventsView } from "@/lib/homeEventsView";

describe("DEFAULT_HOME_VIEW", () => {
  it("is the coming week, soonest first", () => {
    expect(DEFAULT_HOME_VIEW).toEqual({ status: "week", sort: "asc" });
  });

  it("puts the coming week first in the filter list", () => {
    expect(HOME_STATUS_FILTERS[0]).toBe("week");
  });
});

describe("parseHomeEventsView", () => {
  it("reads back every saved combination", () => {
    for (const status of HOME_STATUS_FILTERS) {
      for (const sort of HOME_SORT_ORDERS) expect(parseHomeEventsView({ status, sort })).toEqual({ status, sort });
    }
  });

  it("falls back to the default when nothing is saved", () => {
    expect(parseHomeEventsView(null)).toEqual(DEFAULT_HOME_VIEW);
    expect(parseHomeEventsView(undefined)).toEqual(DEFAULT_HOME_VIEW);
    expect(parseHomeEventsView({})).toEqual(DEFAULT_HOME_VIEW);
  });

  it("falls back per field for an unknown value", () => {
    expect(parseHomeEventsView({ status: "all", sort: "sideways" })).toEqual({ status: "all", sort: "asc" });
    expect(parseHomeEventsView({ status: "archived", sort: "desc" })).toEqual({ status: "week", sort: "desc" });
    expect(parseHomeEventsView({ status: "ALL", sort: "DESC" })).toEqual(DEFAULT_HOME_VIEW);
  });

  it("ignores values that aren't an object, and keeps only the two fields", () => {
    expect(parseHomeEventsView("all")).toEqual(DEFAULT_HOME_VIEW);
    expect(parseHomeEventsView(42)).toEqual(DEFAULT_HOME_VIEW);
    // The month/date/range values themselves aren't stored, only the kind (owner, 2026-10-13).
    expect(parseHomeEventsView({ status: "upcoming", sort: "month", month: "2026-10" })).toEqual({ status: "upcoming", sort: "month" });
  });

  it("survives a JSON round trip", () => {
    const view = { status: "completed", sort: "range" };
    expect(parseHomeEventsView(JSON.parse(JSON.stringify(view)))).toEqual(view);
  });
});

describe("comingWeekRange", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("is today through a week from today", () => {
    expect(comingWeekRange(new Date("2026-10-20T10:00:00Z"))).toEqual({ from: "2026-10-20", to: "2026-10-27" });
  });

  it("goes by the Israeli date, not UTC, after midnight in Israel", () => {
    // 22:30 UTC on the 19th is 01:30 on the 20th in Israel (UTC+3).
    expect(comingWeekRange(new Date("2026-10-19T22:30:00Z"))).toEqual({ from: "2026-10-20", to: "2026-10-27" });
    // 20:59 UTC is still 23:59 on the 19th.
    expect(comingWeekRange(new Date("2026-10-19T20:59:00Z"))).toEqual({ from: "2026-10-19", to: "2026-10-26" });
  });

  it("goes by Israeli winter time (UTC+2) in winter", () => {
    expect(comingWeekRange(new Date("2026-12-31T22:30:00Z"))).toEqual({ from: "2027-01-01", to: "2027-01-08" });
    expect(comingWeekRange(new Date("2026-12-31T21:30:00Z"))).toEqual({ from: "2026-12-31", to: "2027-01-07" });
  });

  it("spans a month and a year boundary", () => {
    expect(comingWeekRange(new Date("2026-10-28T10:00:00Z"))).toEqual({ from: "2026-10-28", to: "2026-11-04" });
    expect(comingWeekRange(new Date("2026-12-28T10:00:00Z"))).toEqual({ from: "2026-12-28", to: "2027-01-04" });
  });

  it("is still seven days across a clock change, during the day", () => {
    // Israel leaves DST on 2026-10-25 and enters it on 2027-03-26.
    expect(comingWeekRange(new Date("2026-10-22T09:00:00Z"))).toEqual({ from: "2026-10-22", to: "2026-10-29" });
    expect(comingWeekRange(new Date("2027-03-22T09:00:00Z"))).toEqual({ from: "2027-03-22", to: "2027-03-29" });
  });

  it("uses the current time by default", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-19T22:30:00Z"));
    expect(comingWeekRange()).toEqual({ from: "2026-10-20", to: "2026-10-27" });
  });
});

describe("comingWeekRange across a clock change (found by the tests, 2026-10-20)", () => {
  it("ends 7 calendar days later, not 168 hours later", () => {
    // 00:30 in Israel on Oct 21, 2026, four days before the clocks go back.
    expect(comingWeekRange(new Date("2026-10-20T21:30:00Z"))).toEqual({ from: "2026-10-21", to: "2026-10-28" });
    // 23:30 in Israel on Mar 20, 2026, a week before the clocks go forward.
    expect(comingWeekRange(new Date("2026-03-20T21:30:00Z"))).toEqual({ from: "2026-03-20", to: "2026-03-27" });
    // Month and year rollover.
    expect(comingWeekRange(new Date("2026-12-28T10:00:00Z"))).toEqual({ from: "2026-12-28", to: "2027-01-04" });
  });
});
