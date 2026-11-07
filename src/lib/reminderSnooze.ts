// "תזכורת" on every reminder window on the home screen (owner, 2026-11-07: "an option that lets
// the user pick a date and a time to be reminded, and two quick ones: an hour and three hours"):
// the window goes away and comes back at that time, with a phone notification
// (api/cron/lead-reminders). `scheduled_messages.remind_at` / `remind_set_at` / `remind_pushed_at`
// (migration 0174), the columns the quote follow-up's reminder already used.

export const SNOOZE_QUICK_MINUTES = [60, 180] as const;
// 30 minutes: the quote follow-up's old quick option, for a window still open on a device.
const ACCEPTED_MINUTES = new Set<number>([30, ...SNOOZE_QUICK_MINUTES]);
export const SNOOZE_MAX_DAYS = 90;

// The reminder windows on the home screen (app/page.tsx loads them; each can be put off).
export const SNOOZABLE_KINDS = [
  "payment_reminder",
  "review_request",
  "lead_quote_followup",
  "album_approval_reminder",
  "song_selection_reminder",
  "shoot_day_reminder",
  "song_stage_reminder",
] as const;

/** When the window comes back (ms), from a quick option or a chosen moment; null when it isn't valid. */
export function snoozeTime(body: { remindMinutes?: unknown; remindAt?: unknown }, now: number): number | null {
  if (body.remindAt !== undefined) {
    const at = typeof body.remindAt === "string" ? Date.parse(body.remindAt) : NaN;
    return Number.isFinite(at) && at >= now + 30_000 && at <= now + SNOOZE_MAX_DAYS * 86_400_000 ? at : null;
  }
  const minutes = Number(body.remindMinutes);
  return ACCEPTED_MINUTES.has(minutes) ? now + minutes * 60_000 : null;
}

/** A window put off to a time that hasn't come yet stays hidden. */
export function isSnoozed(remindAt: string | null | undefined, now: number): boolean {
  return !!remindAt && Date.parse(remindAt) > now;
}
