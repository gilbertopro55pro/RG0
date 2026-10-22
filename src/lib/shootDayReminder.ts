// A reminder 3 days before the event to send the client the "יום הצילום" message the photographer
// saved in the client messages settings (owner, 2026-10-22, "עדכון שקוף"). The daily
// send-scheduled-messages cron picks the events (shootDayReminderDue), adds an awaiting_confirmation
// row and a phone notification; the home screen opens the message window with send and cancel.
// Switched off per photographer in Settings › Automation (photographers.shoot_day_reminder).

export const SHOOT_DAY_REMINDER_DAYS = 3;

// "2026-10-22" plus n days.
export function addDaysIso(iso: string, n: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

// Whole days from one date to another ("2026-10-22" → "2026-10-25" is 3).
export function daysBetweenIso(from: string, to: string): number {
  const [a, b] = [from, to].map((iso) => {
    const [y, m, d] = iso.split("-").map(Number);
    return Date.UTC(y, m - 1, d);
  });
  return Math.round((b - a) / 86_400_000);
}

// Today's date in Israel, whatever the server's time zone.
export function israelTodayIso(now: Date = new Date()): string {
  return now.toLocaleDateString("en-CA", { timeZone: "Asia/Jerusalem" });
}

export type ShootDayCandidate = {
  event_date: string;
  client_phone: string | null;
  is_freelance: boolean | null;
  needs_review: boolean | null;
  closed_at: string | null;
  event_stages: { stage_key: string | null; done: boolean }[];
};

// Whether the event gets the reminder today. The window is 1–3 days ahead rather than exactly 3, so
// an event booked two days before, or a day the cron missed, still gets one; the event day itself
// never does. Once per event date: `earlierReminders` are the send_at of the event's earlier
// reminder rows (any status), and one from this window counts, so cancel isn't asked again. A
// reminder from before the date moved doesn't count. `alreadySent`: the photographer sent the shoot
// day message by hand lately.
export function shootDayReminderDue(
  event: ShootDayCandidate,
  todayIso: string,
  earlierReminders: readonly string[],
  alreadySent: boolean
): boolean {
  const days = daysBetweenIso(todayIso, event.event_date);
  if (days < 1 || days > SHOOT_DAY_REMINDER_DAYS) return false;
  if (!event.client_phone?.trim() || event.is_freelance || event.needs_review || event.closed_at) return false;
  // Packages without a shoot day, or one already marked (the stage carries the message).
  const shoot = event.event_stages.find((s) => s.stage_key === "shoot_day");
  if (!shoot || shoot.done) return false;
  if (alreadySent) return false;
  const windowStart = addDaysIso(event.event_date, -SHOOT_DAY_REMINDER_DAYS - 1);
  return !earlierReminders.some((sendAt) => sendAt.slice(0, 10) >= windowStart);
}
