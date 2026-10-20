import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GoogleCalendarEvent } from "@/lib/google";

// Google is mocked; the database is a fake query builder that records the filters and answers per
// table. Only the decision logic (which rows count as taking the date) is under test.
const listSyncedCalendarEvents = vi.fn();
vi.mock("@/lib/googleCalendarSync", () => ({
  listSyncedCalendarEvents: (...args: unknown[]) => listSyncedCalendarEvents(...args),
}));

import { findDateConflict } from "@/lib/dateConflict";

type Op = [string, ...unknown[]];
type Call = { table: string; ops: Op[] };

function fakeSupabase(tables: Record<string, unknown>) {
  const calls: Call[] = [];
  const client = {
    from(table: string) {
      const call: Call = { table, ops: [] };
      calls.push(call);
      const chain: object = new Proxy(
        {},
        {
          get(_t, prop: string) {
            if (prop === "then") {
              return (resolve: (v: unknown) => void) => resolve({ data: tables[table] ?? null, error: null });
            }
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

const ev = (id: string, client_name: string, event_start_time: string | null, event_end_time: string | null) => ({
  id,
  client_name,
  event_start_time,
  event_end_time,
});

const gEvent = (id: string, summary: string, start: string, end: string, colorId = "5"): GoogleCalendarEvent => ({
  id,
  summary,
  htmlLink: "",
  colorId,
  start: { dateTime: start },
  end: { dateTime: end },
});

const COLORS = { google_calendar_import_color_id: "5", google_calendar_color_id: "9" };
const base = { photographerId: "ph1", date: "2026-10-22" };

beforeEach(() => {
  listSyncedCalendarEvents.mockReset();
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("findDateConflict: other events in the app", () => {
  it("filters by the photographer and the date, and leaves out the event being edited", async () => {
    const { client, calls } = fakeSupabase({ events: [] });
    await findDateConflict(client, { ...base, start: "19:00", end: "23:00", calendar: false, excludeEventId: "ev-self" });
    expect(calls[0].table).toBe("events");
    expect(calls[0].ops).toContainEqual(["eq", "photographer_id", "ph1"]);
    expect(calls[0].ops).toContainEqual(["eq", "event_date", "2026-10-22"]);
    expect(calls[0].ops).toContainEqual(["neq", "id", "ev-self"]);
  });

  it("doesn't exclude anything when creating", async () => {
    const { client, calls } = fakeSupabase({ events: [] });
    await findDateConflict(client, { ...base, start: null, end: null, calendar: false });
    expect(calls[0].ops.some(([op]) => op === "neq")).toBe(false);
  });

  it("names the event whose hours overlap", async () => {
    const { client } = fakeSupabase({ events: [ev("1", "Morning shoot", "09:00:00", "12:00:00"), ev("2", "Dana & Avi", "18:00:00", "23:00:00")] });
    expect(await findDateConflict(client, { ...base, start: "20:00", end: "00:00", calendar: false })).toEqual({ source: "event", name: "Dana & Avi" });
  });

  it("is free when the hours don't overlap", async () => {
    const { client, calls } = fakeSupabase({ events: [ev("1", "Morning shoot", "09:00", "13:00")] });
    expect(await findDateConflict(client, { ...base, start: "19:00", end: "23:00", calendar: false })).toBeNull();
    // Without the calendar flag, nothing else is read.
    expect(calls).toHaveLength(1);
  });

  it("treats an event without hours as taking the whole day", async () => {
    const { client } = fakeSupabase({ events: [ev("1", "All day", null, null)] });
    expect(await findDateConflict(client, { ...base, start: "09:00", end: "10:00", calendar: false })).toEqual({ source: "event", name: "All day" });
  });

  it("treats a new event without hours as clashing with any event that day", async () => {
    const { client } = fakeSupabase({ events: [ev("1", "Evening", "19:00", "23:00")] });
    expect(await findDateConflict(client, { ...base, start: null, end: null, calendar: false })).toEqual({ source: "event", name: "Evening" });
  });

  it("is free on an empty date", async () => {
    const { client } = fakeSupabase({ events: null });
    expect(await findDateConflict(client, { ...base, start: null, end: null, calendar: false })).toBeNull();
  });

  it("returns the app's event before looking at the calendar", async () => {
    const { client, calls } = fakeSupabase({ events: [ev("1", "Booked", null, null)], photographers: COLORS });
    expect(await findDateConflict(client, { ...base, start: null, end: null, calendar: true })).toEqual({ source: "event", name: "Booked" });
    expect(calls.map((c) => c.table)).toEqual(["events"]);
    expect(listSyncedCalendarEvents).not.toHaveBeenCalled();
  });
});

describe("findDateConflict: the photographer's Google Calendar", () => {
  it("names a calendar booking whose hours overlap, by the booking colors", async () => {
    listSyncedCalendarEvents.mockResolvedValue([
      gEvent("g1", "Dentist", "2026-10-22T06:00:00Z", "2026-10-22T07:00:00Z", "1"),
      gEvent("g2", "Hold: Cohen wedding", "2026-10-22T16:00:00Z", "2026-10-22T21:00:00Z", "5"),
    ]);
    const { client } = fakeSupabase({ events: [], photographers: COLORS });
    expect(await findDateConflict(client, { ...base, start: "19:30", end: "23:30", calendar: true })).toEqual({
      source: "calendar",
      name: "Hold: Cohen wedding",
    });
  });

  it("ignores a calendar booking at other hours", async () => {
    // 09:00–11:00 Israel time.
    listSyncedCalendarEvents.mockResolvedValue([gEvent("g1", "Morning", "2026-10-22T06:00:00Z", "2026-10-22T08:00:00Z", "9")]);
    const { client } = fakeSupabase({ events: [], photographers: COLORS });
    expect(await findDateConflict(client, { ...base, start: "19:00", end: "23:00", calendar: true })).toBeNull();
  });

  it("skips the event's own synced copy and the booking it was created from", async () => {
    listSyncedCalendarEvents.mockResolvedValue([
      gEvent("own-copy", "Same event", "2026-10-22T16:00:00Z", "2026-10-22T20:00:00Z", "9"),
      gEvent("source", "Imported booking", "2026-10-22T16:00:00Z", "2026-10-22T20:00:00Z", "5"),
    ]);
    const { client } = fakeSupabase({ events: [], photographers: COLORS });
    expect(
      await findDateConflict(client, { ...base, start: "19:00", end: "23:00", calendar: true, excludeCalendarIds: ["own-copy", null, undefined, "source"] }),
    ).toBeNull();
  });

  it("still finds a different booking next to the skipped ones", async () => {
    listSyncedCalendarEvents.mockResolvedValue([
      gEvent("own-copy", "Same event", "2026-10-22T16:00:00Z", "2026-10-22T20:00:00Z", "9"),
      gEvent("other", "Another client", "2026-10-22T17:00:00Z", "2026-10-22T19:00:00Z", "5"),
    ]);
    const { client } = fakeSupabase({ events: [], photographers: COLORS });
    expect(await findDateConflict(client, { ...base, start: "19:00", end: "23:00", calendar: true, excludeCalendarIds: ["own-copy"] })).toEqual({
      source: "calendar",
      name: "Another client",
    });
  });

  it("is free when the photographer row is missing or has no colors", async () => {
    const missing = fakeSupabase({ events: [], photographers: null });
    expect(await findDateConflict(missing.client, { ...base, start: null, end: null, calendar: true })).toBeNull();
    const noColors = fakeSupabase({ events: [], photographers: { google_calendar_import_color_id: null, google_calendar_color_id: null } });
    expect(await findDateConflict(noColors.client, { ...base, start: null, end: null, calendar: true })).toBeNull();
    expect(listSyncedCalendarEvents).not.toHaveBeenCalled();
  });

  it("lets the calendar fail quietly", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    listSyncedCalendarEvents.mockRejectedValue(new Error("network"));
    const { client } = fakeSupabase({ events: [], photographers: COLORS });
    expect(await findDateConflict(client, { ...base, start: null, end: null, calendar: true })).toBeNull();
  });
});
