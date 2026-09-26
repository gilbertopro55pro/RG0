// Parts of an event day for the intake assistant's date check (photographers.intake_allow_split_day,
// migration 0135): a morning event (07:30-15:00, e.g. a bar mitzvah at the synagogue) and an evening
// event (18:00-00:00) may share a date (owner's hours, 2026-09-26). An event blocks each part its hours overlap; an event with
// no start time blocks the whole day.
export type DaySlot = "morning" | "evening";

export const SLOT_LABELS: Record<DaySlot, string> = { morning: "בוקר", evening: "ערב" };

const WINDOWS: Record<DaySlot, [number, number]> = {
  morning: [7 * 60 + 30, 15 * 60],
  evening: [18 * 60, 24 * 60],
};

function minutes(t: string | null | undefined): number | null {
  const m = /^(\d{1,2}):(\d{2})/.exec(t ?? "");
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

export type TimedEvent = { arrival_time: string | null; event_start_time: string | null; event_end_time: string | null };

// The minutes of the day an event occupies, [start, end). No start time = the whole day.
export function eventSpan(e: TimedEvent): [number, number] {
  const starts = [minutes(e.arrival_time), minutes(e.event_start_time)].filter((x): x is number => x !== null);
  if (starts.length === 0) return [0, 24 * 60];
  const start = Math.min(...starts);
  let end = minutes(e.event_end_time);
  // No end time: a morning event runs up to 4 hours, anything later until midnight.
  if (end === null) end = start < 14 * 60 ? start + 4 * 60 : 24 * 60;
  // 00:00, or an end before the start, means the event runs until midnight.
  if (end <= start) end = 24 * 60;
  return [start, end];
}

export function blocksSlot(e: TimedEvent, slot: DaySlot): boolean {
  const [s, en] = eventSpan(e);
  const [ws, we] = WINDOWS[slot];
  return s < we && en > ws;
}
