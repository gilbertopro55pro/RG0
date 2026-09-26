import type { SupabaseClient } from "@supabase/supabase-js";
import { listSyncedCalendarEvents } from "@/lib/googleCalendarSync";
import type { GoogleCalendarEvent } from "@/lib/google";
import type { TimedEvent } from "@/lib/daySlots";

const TZ = "Asia/Jerusalem";

// Israel-local date (YYYY-MM-DD) and time (HH:MM) of an instant.
function localParts(iso: string): { date: string; time: string } {
  const d = new Date(iso);
  const date = new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(d);
  const time = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(d);
  return { date, time };
}

function nextDay(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
}

// A Google Calendar event as the part of `date` it occupies. All-day events (start.date) take the
// whole day; timed events are clipped to the day ("00:00" end = until midnight, see daySlots).
export function googleEventOnDate(e: GoogleCalendarEvent, date: string): TimedEvent | null {
  if (e.start.date) {
    const endExclusive = e.end.date ?? nextDay(e.start.date);
    return e.start.date <= date && date < endExclusive ? { arrival_time: null, event_start_time: null, event_end_time: null } : null;
  }
  if (!e.start.dateTime || !e.end.dateTime) return null;
  const s = localParts(e.start.dateTime);
  const en = localParts(e.end.dateTime);
  if (s.date > date || en.date < date || (en.date === date && en.time === "00:00" && s.date < date)) return null;
  return {
    arrival_time: null,
    event_start_time: s.date < date ? "00:00" : s.time,
    event_end_time: en.date > date ? "00:00" : en.time,
  };
}

// Events on the photographer's Google Calendar that mark them busy on `date`: the color chosen in
// settings for bookings (google_calendar_import_color_id) and the color the app gives the events it
// syncs (google_calendar_color_id). The intake assistant checks these next to its own events, so a
// booking written only in the calendar still makes the date taken (bug found by the owner,
// 2026-09-26). Any Google failure returns [] and the check falls back to the app's events.
export async function googleBusyOnDate(
  supabase: SupabaseClient,
  photographerId: string,
  colors: (string | null | undefined)[],
  date: string
): Promise<TimedEvent[]> {
  const wanted = new Set(colors.filter((c): c is string => !!c));
  if (wanted.size === 0) return [];
  try {
    const [y, m, d] = date.split("-").map(Number);
    const timeMin = new Date(Date.UTC(y, m - 1, d - 1, 12)).toISOString();
    const timeMax = new Date(Date.UTC(y, m - 1, d + 1, 12)).toISOString();
    const events = await listSyncedCalendarEvents(supabase, photographerId, { timeMin, timeMax });
    if (!events) return [];
    return events
      .filter((e) => e.colorId && wanted.has(e.colorId))
      .map((e) => googleEventOnDate(e, date))
      .filter((e): e is TimedEvent => e !== null);
  } catch (e) {
    console.error("Intake calendar check failed:", photographerId, e);
    return [];
  }
}
