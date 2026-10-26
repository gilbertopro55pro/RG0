import { compareEventsChronologically } from "@/lib/eventOrder";
import { shiftDate } from "@/lib/tasks";
import type { TFn } from "@/i18n/translate";

// The morning notification (owner, 2026-10-26): at 08:00 Israel time, a phone notification with
// the day's open tasks (the to-do list, lib/tasks.ts) and the next shoot, in place of a home-screen
// widget, which a web app can't have. Sent by api/cron/morning-digest, which Vercel runs at 05:00
// and 06:00 UTC: one of them is 08:00 in Israel, summer or winter, and photographers
// .morning_digest_sent_on keeps it to once a day. Only on a day with something to say: an open
// task (today's or left from earlier days), or a shoot today or tomorrow. On by default
// (photographers.morning_digest), switched off in Settings › Automation or in the tasks panel.
// Tapping it opens the tasks panel (/?tasks=1, TasksButton).

export const MORNING_DIGEST_HOUR = 8;
// Tasks named in the notification; the rest are counted.
const TASKS_SHOWN = 3;

export function israelHour(now: Date = new Date()): number {
  return Number(now.toLocaleString("en-GB", { timeZone: "Asia/Jerusalem", hour: "2-digit", hourCycle: "h23" }));
}

// From 08:00 until 11:00 in Israel: the cron's 05:00 UTC run is 08:00 in summer and 07:00 in
// winter, its 06:00 UTC run 09:00 and 08:00. A late run still sends; the date column stops a second.
export function inMorningWindow(now: Date = new Date()): boolean {
  const h = israelHour(now);
  return h >= MORNING_DIGEST_HOUR && h < MORNING_DIGEST_HOUR + 3;
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
}: {
  tasks: readonly DigestTask[];
  event: DigestEvent | null;
  today: string;
  t: TFn;
  locale: string;
}): { title: string; body: string } | null {
  const shootSoon = !!event && event.event_date <= shiftDate(today, 1);
  if (tasks.length === 0 && !shootSoon) return null;
  const title =
    tasks.length === 0
      ? t("בוקר טוב! אין משימות פתוחות להיום")
      : tasks.length === 1
        ? t("בוקר טוב! משימה אחת להיום")
        : t("בוקר טוב! {n} משימות להיום", { n: tasks.length });
  const lines: string[] = [];
  if (tasks.length) {
    const named = tasks.slice(0, TASKS_SHOWN).map((x) => x.title.trim());
    const more = tasks.length - named.length;
    lines.push(more > 0 ? `${named.join(" · ")} · ${t("ועוד {n}", { n: more })}` : named.join(" · "));
  }
  if (event) lines.push(shootLine(event, today, t, locale));
  return { title, body: lines.join("\n") };
}
