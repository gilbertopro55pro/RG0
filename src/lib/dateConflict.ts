import type { SupabaseClient } from "@supabase/supabase-js";
import { eventsConflict } from "@/lib/eventTime";
import { googleBusyEntriesOnDate } from "@/lib/calendarBusy";

// What already takes a date: another event in the app, or (calendar: true) a booking in the
// photographer's Google Calendar, by the same colors the intake assistant checks (calendarBusy.ts).
// The hours count the same way for both (eventTime.ts): no hours on either side = the whole day.
// The calendar part is for the photographer's own forms only, where it's a warning they can save
// past (owner, 2026-10-12: moving an event to a date taken in the calendar gave no warning). A
// client's questionnaire and the calendar import don't use it.
export type DateConflict = { source: "event" | "calendar"; name: string };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function findDateConflict(supabase: SupabaseClient<any>, o: {
  photographerId: string;
  date: string;
  start: string | null;
  end: string | null;
  calendar: boolean;
  // The event being edited, and the calendar entries that are this same event (its own synced copy,
  // or the calendar booking it's being created from).
  excludeEventId?: string;
  excludeCalendarIds?: (string | null | undefined)[];
}): Promise<DateConflict | null> {
  let q = supabase
    .from("events")
    .select("id, client_name, event_start_time, event_end_time")
    .eq("photographer_id", o.photographerId)
    .eq("event_date", o.date);
  if (o.excludeEventId) q = q.neq("id", o.excludeEventId);
  const { data: sameDate } = await q.returns<{ id: string; client_name: string; event_start_time: string | null; event_end_time: string | null }[]>();
  const range = { start: o.start, end: o.end };
  const event = (sameDate ?? []).find((e) => eventsConflict(range, { start: e.event_start_time, end: e.event_end_time }));
  if (event) return { source: "event", name: event.client_name };
  if (!o.calendar) return null;

  const { data: p } = await supabase
    .from("photographers")
    .select("google_calendar_import_color_id, google_calendar_color_id")
    .eq("id", o.photographerId)
    .maybeSingle<{ google_calendar_import_color_id: string | null; google_calendar_color_id: string | null }>();
  if (!p) return null;
  const skip = new Set(o.excludeCalendarIds?.filter((id): id is string => !!id));
  const entries = await googleBusyEntriesOnDate(supabase, o.photographerId, [p.google_calendar_import_color_id, p.google_calendar_color_id], o.date);
  const hit = entries.find((e) => !skip.has(e.id) && eventsConflict(range, { start: e.event_start_time, end: e.event_end_time }));
  return hit ? { source: "calendar", name: hit.summary } : null;
}
