function toMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

// An end time numerically before the start means the event crosses midnight (e.g. a wedding
// running 20:00–01:30) rather than an invalid range — normalized by pushing the end past the 24h
// mark so a plain linear overlap comparison still works instead of wrapping around.
function normalizedRange(start: string, end: string): { start: number; end: number } {
  const s = toMinutes(start);
  let e = toMinutes(end);
  if (e <= s) e += 24 * 60;
  return { start: s, end: e };
}

// If either event is missing a time range, fall back to a full-day conflict (the safe default,
// matching the previous any-event-same-date behavior) — only refine to a real time-range overlap
// check when both sides have start/end times recorded.
export function eventsConflict(
  a: { start: string | null; end: string | null },
  b: { start: string | null; end: string | null }
): boolean {
  if (!a.start || !a.end || !b.start || !b.end) return true;
  const rangeA = normalizedRange(a.start, a.end);
  const rangeB = normalizedRange(b.start, b.end);
  return rangeA.start < rangeB.end && rangeB.start < rangeA.end;
}
