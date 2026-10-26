import { compareEventsChronologically } from "@/lib/eventOrder";
import { shiftDate } from "@/lib/tasks";
import type { TFn } from "@/i18n/translate";

// The daily tasks reminder (owner, 2026-10-26): a phone notification with the day's open tasks
// (the to-do list, lib/tasks.ts) and the next shoot, in place of a home-screen widget, which a web
// app can't have. At a time the photographer chooses (photographers.morning_digest_minutes, half
// hours from 05:00 to 23:00, 08:00 by default; owner, same day). Sent by api/cron/morning-digest,
// which Vercel runs every half hour; photographers.morning_digest_sent_on keeps it to once a day.
// Only on a day with something to say: an open task (today's or left from earlier days), or a
// shoot today or tomorrow. On by default (photographers.morning_digest), switched off, and the time
// set, in Settings › Automation or in the tasks panel (MorningDigestSettings). Tapping it opens the
// tasks panel (/?tasks=1, TasksButton).

export const DIGEST_DEFAULT_MINUTES = 8 * 60;
export const DIGEST_FIRST_MINUTES = 5 * 60;
export const DIGEST_LAST_MINUTES = 23 * 60;
// The times on offer: every half hour, 05:00–23:00 (the column's check matches).
export const DIGEST_TIMES: readonly number[] = Array.from(
  { length: (DIGEST_LAST_MINUTES - DIGEST_FIRST_MINUTES) / 30 + 1 },
  (_, i) => DIGEST_FIRST_MINUTES + i * 30
);
// A run that comes late still sends, up to this long after the chosen time; the date column stops
// a second one.
const LATE_LIMIT_MINUTES = 3 * 60;
// Tasks named in the notification; the rest are counted.
const TASKS_SHOWN = 3;

export function digestTimeLabel(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

export function isDigestTime(value: unknown): value is number {
  return typeof value === "number" && DIGEST_TIMES.includes(value);
}

// Minutes after midnight, Israel time.
export function israelMinutes(now: Date = new Date()): number {
  const [h, m] = now.toLocaleTimeString("en-GB", { timeZone: "Asia/Jerusalem", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).split(":").map(Number);
  return h * 60 + m;
}

// The run at `nowMinutes` sends to a photographer who chose `chosen`: from the chosen time (a
// couple of minutes early, for a run that starts a moment before the half hour) until three
// hours after it, the same day.
export function digestDueWindow(nowMinutes: number): { from: number; to: number } {
  return { from: nowMinutes - LATE_LIMIT_MINUTES + 1, to: nowMinutes + 2 };
}

export function digestDue(chosen: number, nowMinutes: number): boolean {
  const { from, to } = digestDueWindow(nowMinutes);
  return chosen >= from && chosen <= to;
}

export type DigestTask = { title: string; task_date: string };
export type DigestEvent = {
  client_name: string;
  event_date: string;
  event_start_time: string | null;
  closed_at?: string | null;
  event_stages?: { stage_key: string | null; done: boolean }[] | null;
};

// The next shoot, as on the home screen: the first open event from today on whose "יום הצילום"
// stage isn't marked yet.
export function nextShoot<T extends DigestEvent>(events: readonly T[], today: string): T | null {
  return (
    [...events]
      .sort(compareEventsChronologically)
      .find((e) => !e.closed_at && e.event_date >= today && !(e.event_stages ?? []).some((s) => s.stage_key === "shoot_day" && s.done)) ?? null
  );
}

function shootLine(event: DigestEvent, today: string, t: TFn, locale: string): string {
  const name = event.client_name.trim();
  const time = event.event_start_time ? event.event_start_time.slice(0, 5) : null;
  if (event.event_date === today) return time ? t("הצילום הבא: {name}, היום ב-{time}", { name, time }) : t("הצילום הבא: {name}, היום", { name });
  if (event.event_date === shiftDate(today, 1)) return time ? t("הצילום הבא: {name}, מחר ב-{time}", { name, time }) : t("הצילום הבא: {name}, מחר", { name });
  const date = new Date(`${event.event_date}T12:00:00Z`).toLocaleDateString(locale, { weekday: "long", day: "numeric", month: "numeric", timeZone: "UTC" });
  return t("הצילום הבא: {name}, {date}", { name, date });
}

// The notification, or null on a day with nothing to say. `tasks`: the open tasks for today and
// earlier days, in the order to show them.
export function morningDigest({
  tasks,
  event,
  today,
  t,
  locale,
  minutes = DIGEST_DEFAULT_MINUTES,
}: {
  tasks: readonly DigestTask[];
  event: DigestEvent | null;
  today: string;
  t: TFn;
  locale: string;
  // The time it's sent at, for the greeting.
  minutes?: number;
}): { title: string; body: string } | null {
  const shootSoon = !!event && event.event_date <= shiftDate(today, 1);
  if (tasks.length === 0 && !shootSoon) return null;
  const greeting = minutes < 12 * 60 ? t("בוקר טוב!") : minutes < 17 * 60 ? t("צהריים טובים!") : t("ערב טוב!");
  const count =
    tasks.length === 0 ? t("אין משימות פתוחות להיום") : tasks.length === 1 ? t("משימה אחת להיום") : t("{n} משימות להיום", { n: tasks.length });
  const title = `${greeting} ${count}`;
  const lines: string[] = [];
  if (tasks.length) {
    const named = tasks.slice(0, TASKS_SHOWN).map((x) => x.title.trim());
    const more = tasks.length - named.length;
    lines.push(more > 0 ? `${named.join(" · ")} · ${t("ועוד {n}", { n: more })}` : named.join(" · "));
  }
  if (event) lines.push(shootLine(event, today, t, locale));
  return { title, body: lines.join("\n") };
}
