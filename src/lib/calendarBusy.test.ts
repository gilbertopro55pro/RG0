import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GoogleCalendarEvent } from "@/lib/google";

// The Google side is mocked: only the listing call talks to Google, everything else is pure.
const listSyncedCalendarEvents = vi.fn();
vi.mock("@/lib/googleCalendarSync", () => ({
  listSyncedCalendarEvents: (...args: unknown[]) => listSyncedCalendarEvents(...args),
}));

import { googleBusyEntriesOnDate, googleBusyOnDate, googleEventOnDate } from "@/lib/calendarBusy";

const timed = (start: string, end: string, extra: Partial<GoogleCalendarEvent> = {}): GoogleCalendarEvent => ({
  id: "e1",
  summary: "booking",
  htmlLink: "",
  start: { dateTime: start },
  end: { dateTime: end },
  ...extra,
});

const allDay = (start: string, end?: string, extra: Partial<GoogleCalendarEvent> = {}): GoogleCalendarEvent => ({
  id: "a1",
  summary: "all day",
  htmlLink: "",
  start: { date: start },
  end: end ? { date: end } : {},
  ...extra,
});

const WHOLE_DAY = { arrival_time: null, event_start_time: null, event_end_time: null };
const span = (start: string, end: string) => ({ arrival_time: null, event_start_time: start, event_end_time: end });

describe("googleEventOnDate: all-day events", () => {
  it("takes the whole day it is on", () => {
    expect(googleEventOnDate(allDay("2026-10-22", "2026-10-23"), "2026-10-22")).toEqual(WHOLE_DAY);
  });

  it("treats the end date as exclusive (Google's convention)", () => {
    expect(googleEventOnDate(allDay("2026-10-22", "2026-10-23"), "2026-10-23")).toBeNull();
    expect(googleEventOnDate(allDay("2026-10-22", "2026-10-23"), "2026-10-21")).toBeNull();
  });

  it("covers every day of a multi-day event", () => {
    const e = allDay("2026-10-22", "2026-10-25");
    expect(["2026-10-21", "2026-10-22", "2026-10-23", "2026-10-24", "2026-10-25"].map((d) => googleEventOnDate(e, d) !== null)).toEqual([
      false,
      true,
      true,
      true,
      false,
    ]);
  });

  it("spans a month boundary", () => {
    const e = allDay("2026-10-31", "2026-11-02");
    expect(googleEventOnDate(e, "2026-10-31")).toEqual(WHOLE_DAY);
    expect(googleEventOnDate(e, "2026-11-01")).toEqual(WHOLE_DAY);
    expect(googleEventOnDate(e, "2026-11-02")).toBeNull();
  });

  it("is one day when the end date is missing", () => {
    expect(googleEventOnDate(allDay("2026-12-31"), "2026-12-31")).toEqual(WHOLE_DAY);
    expect(googleEventOnDate(allDay("2026-12-31"), "2027-01-01")).toBeNull();
  });
});

describe("googleEventOnDate: timed events, by Israel time", () => {
  it("converts UTC to Israel summer time (UTC+3)", () => {
    // 16:00Z–20:00Z on 2026-10-22 = 19:00–23:00 in Israel.
    expect(googleEventOnDate(timed("2026-10-22T16:00:00Z", "2026-10-22T20:00:00Z"), "2026-10-22")).toEqual(span("19:00", "23:00"));
  });

  it("converts UTC to Israel winter time (UTC+2) after the clocks go back", () => {
    // Israel leaves DST on 2026-10-25: 17:00Z is then 19:00.
    expect(googleEventOnDate(timed("2026-10-26T17:00:00Z", "2026-10-26T21:00:00Z"), "2026-10-26")).toEqual(span("19:00", "23:00"));
  });

  it("follows the spring change too (DST starts 2026-03-27)", () => {
    expect(googleEventOnDate(timed("2026-03-26T17:00:00Z", "2026-03-26T19:00:00Z"), "2026-03-26")).toEqual(span("19:00", "21:00"));
    expect(googleEventOnDate(timed("2026-03-28T16:00:00Z", "2026-03-28T18:00:00Z"), "2026-03-28")).toEqual(span("19:00", "21:00"));
  });

  it("reads an offset in the timestamp", () => {
    expect(googleEventOnDate(timed("2026-10-22T19:00:00+03:00", "2026-10-22T23:30:00+03:00"), "2026-10-22")).toEqual(span("19:00", "23:30"));
  });

  it("puts an event that is late evening in UTC on the next Israeli day", () => {
    // 22:00Z on the 21st is 01:00 on the 22nd in Israel.
    const e = timed("2026-10-21T22:00:00Z", "2026-10-22T02:00:00Z");
    expect(googleEventOnDate(e, "2026-10-21")).toBeNull();
    expect(googleEventOnDate(e, "2026-10-22")).toEqual(span("01:00", "05:00"));
  });

  it("clips an event that crosses midnight to each day: until 00:00, then from 00:00", () => {
    // 20:00 on the 22nd to 01:30 on the 23rd, Israel time.
    const e = timed("2026-10-22T17:00:00Z", "2026-10-22T22:30:00Z");
    expect(googleEventOnDate(e, "2026-10-22")).toEqual(span("20:00", "00:00"));
    expect(googleEventOnDate(e, "2026-10-23")).toEqual(span("00:00", "01:30"));
  });

  it("does not put an event that ends exactly at midnight on the next day", () => {
    // 19:00–00:00 Israel time on the 22nd.
    const e = timed("2026-10-22T16:00:00Z", "2026-10-22T21:00:00Z");
    expect(googleEventOnDate(e, "2026-10-22")).toEqual(span("19:00", "00:00"));
    expect(googleEventOnDate(e, "2026-10-23")).toBeNull();
  });

  it("takes the whole middle day of an event over three days", () => {
    const e = timed("2026-10-21T15:00:00Z", "2026-10-23T09:00:00Z");
    expect(googleEventOnDate(e, "2026-10-22")).toEqual(span("00:00", "00:00"));
  });

  it("is null on a day the event doesn't touch", () => {
    const e = timed("2026-10-22T16:00:00Z", "2026-10-22T20:00:00Z");
    expect(googleEventOnDate(e, "2026-10-21")).toBeNull();
    expect(googleEventOnDate(e, "2026-10-23")).toBeNull();
  });

  it("is null when the start or end time is missing", () => {
    const e: GoogleCalendarEvent = { id: "x", summary: "", htmlLink: "", start: { dateTime: "2026-10-22T16:00:00Z" }, end: {} };
    expect(googleEventOnDate(e, "2026-10-22")).toBeNull();
  });
});

describe("googleBusyEntriesOnDate", () => {
  const supabase = {} as never;

  beforeEach(() => {
    listSyncedCalendarEvents.mockReset();
  });
  afterEach(() => vi.restoreAllMocks());

  it("doesn't ask Google at all when no color is chosen", async () => {
    expect(await googleBusyEntriesOnDate(supabase, "ph1", [null, undefined, ""], "2026-10-22")).toEqual([]);
    expect(listSyncedCalendarEvents).not.toHaveBeenCalled();
  });

  it("asks for a window from noon the day before to noon the day after (UTC)", async () => {
    listSyncedCalendarEvents.mockResolvedValue([]);
    await googleBusyEntriesOnDate(supabase, "ph1", ["5"], "2026-11-01");
    expect(listSyncedCalendarEvents).toHaveBeenCalledWith(supabase, "ph1", {
      timeMin: "2026-10-31T12:00:00.000Z",
      timeMax: "2026-11-02T12:00:00.000Z",
    });
  });

  it("keeps only the chosen colors, and only events on that date, with id and trimmed title", async () => {
    listSyncedCalendarEvents.mockResolvedValue([
      timed("2026-10-22T16:00:00Z", "2026-10-22T20:00:00Z", { id: "booked", summary: "  Dana & Avi  ", colorId: "5" }),
      timed("2026-10-22T06:00:00Z", "2026-10-22T08:00:00Z", { id: "synced", summary: "Event", colorId: "9" }),
      timed("2026-10-22T10:00:00Z", "2026-10-22T11:00:00Z", { id: "dentist", summary: "Dentist", colorId: "1" }),
      timed("2026-10-22T10:00:00Z", "2026-10-22T11:00:00Z", { id: "nocolor", summary: "No color" }),
      timed("2026-10-21T16:00:00Z", "2026-10-21T20:00:00Z", { id: "daybefore", summary: "Other day", colorId: "5" }),
      allDay("2026-10-22", "2026-10-23", { id: "allday", colorId: "9" }),
    ]);
    const entries = await googleBusyEntriesOnDate(supabase, "ph1", ["5", "9"], "2026-10-22");
    expect(entries).toEqual([
      { ...span("19:00", "23:00"), id: "booked", summary: "Dana & Avi" },
      { ...span("09:00", "11:00"), id: "synced", summary: "Event" },
      { ...WHOLE_DAY, id: "allday", summary: "all day" },
    ]);
  });

  it("gives an empty title for an event without one", async () => {
    const e = timed("2026-10-22T16:00:00Z", "2026-10-22T20:00:00Z", { id: "x", colorId: "5" });
    delete (e as Partial<GoogleCalendarEvent>).summary;
    listSyncedCalendarEvents.mockResolvedValue([e]);
    expect((await googleBusyEntriesOnDate(supabase, "ph1", ["5"], "2026-10-22"))[0].summary).toBe("");
  });

  it("falls back to [] when Google isn't connected or fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    listSyncedCalendarEvents.mockResolvedValue(null);
    expect(await googleBusyEntriesOnDate(supabase, "ph1", ["5"], "2026-10-22")).toEqual([]);
    listSyncedCalendarEvents.mockRejectedValue(new Error("revoked"));
    expect(await googleBusyEntriesOnDate(supabase, "ph1", ["5"], "2026-10-22")).toEqual([]);
  });

  it("googleBusyOnDate returns the same spans without id and title", async () => {
    listSyncedCalendarEvents.mockResolvedValue([timed("2026-10-22T16:00:00Z", "2026-10-22T20:00:00Z", { id: "b", colorId: "5" })]);
    expect(await googleBusyOnDate(supabase, "ph1", ["5"], "2026-10-22")).toEqual([span("19:00", "23:00")]);
  });
});
