import type { PriceQuoteRow } from "@/lib/types";

export function formatDateDMY(isoDate: string): string {
  const d = new Date(isoDate);
  if (Number.isNaN(d.getTime())) return "";
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}.${mm}.${d.getFullYear()}`;
}

// Stored as "HH:MM:SS" (Postgres time) — trimmed to "HH:MM" for display.
export function formatWorkHours(start: string | null, end: string | null): string {
  if (!start || !end) return "";
  return `${start.slice(0, 5)}-${end.slice(0, 5)}`;
}

export function quoteEventDetails(
  quote: Pick<PriceQuoteRow, "event_type" | "event_date" | "event_location" | "work_start_time" | "work_end_time">
): { type?: string; date?: string; location?: string; workHours?: string } {
  return {
    type: quote.event_type?.trim() || undefined,
    date: quote.event_date ? formatDateDMY(quote.event_date) : undefined,
    location: quote.event_location?.trim() || undefined,
    workHours: formatWorkHours(quote.work_start_time, quote.work_end_time) || undefined,
  };
}
