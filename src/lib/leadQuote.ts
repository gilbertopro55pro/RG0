import type { PriceQuoteItem } from "@/lib/types";
import type { PackageType } from "@/lib/stages";
import { classifyName } from "@/lib/leadQuotePrefill";

// A quote sent to a lead from the quote builder (leads.quote_details, migration 0146): what the
// client's quote page (/quotes/<token>) shows, designed like the PDF, and what the questionnaire
// after approval starts from.
export type LeadQuoteDetails = {
  items: PriceQuoteItem[];
  subtotal: number;
  vatAmount: number;
  total: number;
  showVat: boolean;
  eventType?: string;
  eventDate?: string; // YYYY-MM-DD
  eventLocation?: string;
  startTime?: string; // HH:MM
  endTime?: string; // HH:MM
  notes?: string;
  createdAt: string; // ISO
  // The photographer chose to send a contract with the quote (owner, 2026-10-01): the client's
  // questionnaire ends with signing it (lib/quoteContract.ts).
  withContract?: boolean;
};

// The owner's shooting hours (2026-10-01): evening 19:00-00:00 with family photos at 18:30, morning
// 09:00-13:00 with family photos at 08:30. Family photos are always 30 minutes before the start.
export type DaySlotKind = "morning" | "evening";
export const SLOT_HOURS: Record<DaySlotKind, { start: string; end: string }> = {
  evening: { start: "19:00", end: "00:00" },
  morning: { start: "09:00", end: "13:00" },
};
export const EXTRA_HOUR_PRICE = 250;
export const MORNING_PACKAGE_HOURS = 4;
// An evening event is up to 5 hours (owner, 2026-10-01): 19:00-00:00, or 18:00-23:00 when it starts
// earlier — the extra hours start after 5.
export const EVENING_PACKAGE_HOURS = 5;

function toMin(t: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(t.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  return h > 23 || min > 59 ? null : h * 60 + min;
}

function fromMin(total: number): string {
  const t = ((total % 1440) + 1440) % 1440;
  return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
}

export function familyPhotosTime(start: string): string {
  const s = toMin(start);
  return s === null ? "" : fromMin(s - 30);
}

// Minutes from start to end; an end at or before the start is the next day (19:00-00:00 = 5h).
export function spanMinutes(start: string, end: string): number | null {
  const s = toMin(start);
  const e = toMin(end);
  if (s === null || e === null) return null;
  return e > s ? e - s : e + 1440 - s;
}

// The extra-cost notice for hours outside the package (owner's rules, 2026-10-01):
// - evening: longer than 5 hours (19:00-00:00 is in; 18:00-23:30 is half an hour over);
// - morning: longer than 4 hours (the packages are for 4 shooting hours).
// Null when the hours are within the package.
export function extraHoursNotice(slot: DaySlotKind, start: string, end: string): string | null {
  const span = spanMinutes(start, end);
  if (span === null) return null;
  const packageHours = slot === "evening" ? EVENING_PACKAGE_HOURS : MORNING_PACKAGE_HOURS;
  const limit = packageHours * 60;
  if (span > limit) {
    const hours = Math.ceil((span - limit) / 60);
    const extra = hours === 1 ? "שעה נוספת" : `${hours} שעות נוספות`;
    return slot === "evening"
      ? `אירוע ערב הוא עד ${EVENING_PACKAGE_HOURS} שעות צילום. מעבר לזה יש תשלום נוסף של ${EXTRA_HOUR_PRICE} ₪ לשעה לכל צלם (${extra}).`
      : `החבילות הן ל-${MORNING_PACKAGE_HOURS} שעות צילום. מסגרת ארוכה יותר כרוכה בתשלום נוסף של ${EXTRA_HOUR_PRICE} ₪ לשעה לכל צלם (${extra}).`;
  }
  return null;
}

// Morning or evening, from what's known: the assistant's eventSlot, else the quote's start hour
// (before 15:00 = morning), else evening.
export function slotFor(eventSlot: string | null | undefined, startTime?: string): DaySlotKind {
  if (eventSlot === "morning" || eventSlot === "evening") return eventSlot;
  const s = startTime ? toMin(startTime) : null;
  if (s !== null) return s < 15 * 60 ? "morning" : "evening";
  return "evening";
}

// A lead quoted from the builder has no package; the event's stages still need one. Chosen from
// the quote's items: an album → the full flow (album design and approval stages), else video with a
// clip / video / stills only.
export function packageFromItems(items: PriceQuoteItem[]): PackageType {
  const cats = new Set(items.map((it) => classifyName(it.item)));
  if (cats.has("album")) return "full";
  if (cats.has("video")) return "stills_video";
  if (cats.has("clip")) return "stills_reel";
  return "stills";
}
