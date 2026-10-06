// Events in chronological order: by date, then by start time on the same date (owner, 2026-10-06:
// a morning and an evening event on the same day came back in whichever order the database gave,
// so the home screen showed the evening one as "הצילום הבא"). An event without a start time comes
// after the timed ones of its day.
type Dated = { event_date: string; event_start_time?: string | null };

export function compareEventsChronologically(a: Dated, b: Dated): number {
  if (a.event_date !== b.event_date) return a.event_date < b.event_date ? -1 : 1;
  const at = a.event_start_time ?? null;
  const bt = b.event_start_time ?? null;
  if (at === bt) return 0;
  if (at === null) return 1;
  if (bt === null) return -1;
  return at < bt ? -1 : 1;
}
