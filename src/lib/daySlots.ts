// Parts of an event day for the intake assistant's date check (photographers.intake_allow_split_day,
// migration 0135): a morning event (e.g. a bar mitzvah at the synagogue), an afternoon event and an
// evening event may share a date. Each part's hours are the photographer's own
// (photographers.intake_day_slots, migration 0187, owner 2026-10-19); the defaults are the owner's
// hours from 2026-09-26 (morning 07:30-15:00, evening 18:00-00:00) and an afternoon of 12:00-16:00.
// An event blocks each part its hours overlap; an event with no start time blocks the whole day.
export type DaySlot = "morning" | "afternoon" | "evening";

export const DAY_SLOTS: DaySlot[] = ["morning", "afternoon", "evening"];

export const SLOT_LABELS: Record<DaySlot, string> = { morning: "בוקר", afternoon: "צהריים", evening: "ערב" };

export type SlotHours = { start: string; end: string };
export type DaySlotHours = Record<DaySlot, SlotHours>;

export const DEFAULT_SLOT_HOURS: DaySlotHours = {
  morning: { start: "07:30", end: "15:00" },
  afternoon: { start: "12:00", end: "16:00" },
  evening: { start: "18:00", end: "00:00" },
};

export function isDaySlot(v: unknown): v is DaySlot {
  return v === "morning" || v === "afternoon" || v === "evening";
}

function minutes(t: string | null | undefined): number | null {
  const m = /^(\d{1,2}):(\d{2})/.exec(t ?? "");
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

// A part's window in minutes of the day, [start, end). An end of 00:00 is midnight. Null when the
// hours aren't a valid range (the start isn't before the end).
export function slotWindow(h: SlotHours): [number, number] | null {
  const s = minutes(h.start);
  let e = minutes(h.end);
  if (s === null || e === null || s >= 24 * 60 || e > 24 * 60) return null;
  if (e === 0) e = 24 * 60;
  return s < e ? [s, e] : null;
}

// The photographer's hours (intake_day_slots), each part falling back to its default when missing
// or invalid. Stored as written by the settings page, so it's checked here too.
export function slotHours(stored: unknown): DaySlotHours {
  const out = { ...DEFAULT_SLOT_HOURS };
  if (!stored || typeof stored !== "object") return out;
  for (const slot of DAY_SLOTS) {
    const h = (stored as Record<string, unknown>)[slot] as Partial<SlotHours> | undefined;
    if (h && typeof h.start === "string" && typeof h.end === "string" && /^\d{2}:\d{2}$/.test(h.start) && /^\d{2}:\d{2}$/.test(h.end) && slotWindow(h as SlotHours)) {
      out[slot] = { start: h.start, end: h.end };
    }
  }
  return out;
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

export function blocksSlot(e: TimedEvent, slot: DaySlot, hours: DaySlotHours = DEFAULT_SLOT_HOURS): boolean {
  const [s, en] = eventSpan(e);
  const [ws, we] = slotWindow(hours[slot]) ?? slotWindow(DEFAULT_SLOT_HOURS[slot])!;
  return s < we && en > ws;
}

// Shabbat rule (photographers.intake_shabbat_closed, migration 0136): Friday is open only until
// 16:00 (a morning event, or an afternoon event that ends by 16:00), Friday evening and Saturday
// daytime are closed, and Saturday evening (after Shabbat ends) is open (owner, 2026-09-26). Returns
// why the requested date/part is closed, or null. `slot` undefined = the part of the day isn't known
// yet (treated as closed on Shabbat).
export const FRIDAY_LAST_END = "16:00";

export function openOnFriday(slot: DaySlot | undefined, hours: DaySlotHours = DEFAULT_SLOT_HOURS): boolean {
  if (slot === "morning") return true;
  const w = slot === "afternoon" ? slotWindow(hours.afternoon) : null;
  return !!w && w[1] <= minutes(FRIDAY_LAST_END)!;
}

export function shabbatClosure(dateIso: string, slot: DaySlot | undefined, hours: DaySlotHours = DEFAULT_SLOT_HOURS): "friday_evening" | "saturday" | null {
  const [y, m, d] = dateIso.split("-").map(Number);
  const weekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 5 = Friday, 6 = Saturday
  if (weekday === 6) return slot === "evening" ? null : "saturday";
  if (weekday === 5) return openOnFriday(slot, hours) ? null : "friday_evening";
  return null;
}
