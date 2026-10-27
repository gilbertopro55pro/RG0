// Sent to the print house (owner, 2026-10-27): the home screen's event row or block says when the
// album was sent ("אלבום נשלח לדפוס בתאריך: …"), and N days after the send a task to check with the
// print house whether the album is ready goes into the to-do list. The task is created by a
// database trigger when the print job finishes (migration 0196); N is photographers
// .print_check_days, 3–14, 5 by default (Settings › Automation, PrintCheckSettings).

export const PRINT_CHECK_DAYS_DEFAULT = 5;
export const PRINT_CHECK_DAY_OPTIONS: readonly number[] = Array.from({ length: 12 }, (_, i) => i + 3);

export function isPrintCheckDays(value: unknown): value is number {
  return typeof value === "number" && PRINT_CHECK_DAY_OPTIONS.includes(value);
}

// A finished print send (gallery_album_export_jobs with send_to_email, status "ready"), with its
// gallery's event.
export type PrintSendRow = {
  created_at: string;
  gallery: { event_id: string | null } | { event_id: string | null }[] | null;
};

// The latest send for each event, by event id.
export function latestPrintSendByEvent(rows: readonly PrintSendRow[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const row of rows) {
    const gallery = Array.isArray(row.gallery) ? row.gallery[0] : row.gallery;
    const eventId = gallery?.event_id;
    if (!eventId) continue;
    if (!out[eventId] || row.created_at > out[eventId]) out[eventId] = row.created_at;
  }
  return out;
}

// The send's date as the photographer sees it, in Israel time (the same on the server and in the
// browser, so the page doesn't render twice).
export function printSentDate(iso: string, locale: string): string {
  return new Date(iso).toLocaleDateString(locale, { day: "numeric", month: "numeric", year: "numeric", timeZone: "Asia/Jerusalem" });
}
