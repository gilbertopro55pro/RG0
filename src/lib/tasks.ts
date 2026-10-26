// The daily to-do list (owner, 2026-10-26, "עדכון ללא"): the photographer's own tasks by date, from
// the "משימות" button in the home screen's header (TasksButton → TasksPanel, api/tasks, table
// `tasks`, migration 0193). A row per task with its notes on a smaller line, or blocks. Tick the box
// or swipe right to mark it done; swipe left or double-tap to delete; a single tap edits it. The
// rules are here, shared by the panel and the routes.

export const TASK_TITLE_MAX = 200;
export const TASK_NOTES_MAX = 2000;

export type TaskRow = {
  id: string;
  task_date: string; // YYYY-MM-DD
  title: string;
  notes: string | null;
  done: boolean;
  done_at: string | null;
  created_at: string;
};

export const TASK_COLUMNS = "id, task_date, title, notes, done, done_at, created_at";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function isIsoDate(value: unknown): value is string {
  if (typeof value !== "string" || !ISO_DATE.test(value)) return false;
  const d = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

// Today in Israel, the day the list opens on.
export function israelToday(now: Date = new Date()): string {
  return now.toLocaleDateString("en-CA", { timeZone: "Asia/Jerusalem" });
}

export function shiftDate(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// One line of text: control characters out, trimmed.
const cleanTitle = (v: string) => v.replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim();
// Notes keep their line breaks.
const cleanNotes = (v: string) =>
  v
    .replace(/\r\n?/g, "\n")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]+/g, "")
    .replace(/\n{4,}/g, "\n\n\n")
    .trim();

// A new task or an edit, checked. A Hebrew error key (translated on the screen) when it can't be
// saved. Each field is optional on an edit (`partial`); a new task needs a title and a date.
export function parseTaskInput(
  input: unknown,
  partial = false
): { ok: true; value: { title?: string; notes?: string | null; task_date?: string; done?: boolean } } | { ok: false; error: string } {
  const o = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const value: { title?: string; notes?: string | null; task_date?: string; done?: boolean } = {};
  if (o.title !== undefined || !partial) {
    if (typeof o.title !== "string") return { ok: false, error: "נא לכתוב את המשימה" };
    const title = cleanTitle(o.title).slice(0, TASK_TITLE_MAX).trim();
    if (!title) return { ok: false, error: "נא לכתוב את המשימה" };
    value.title = title;
  }
  if (o.notes !== undefined) {
    if (o.notes !== null && typeof o.notes !== "string") return { ok: false, error: "בקשה לא חוקית" };
    const notes = o.notes ? cleanNotes(o.notes).slice(0, TASK_NOTES_MAX).trim() : "";
    value.notes = notes || null;
  }
  if (o.date !== undefined || !partial) {
    if (!isIsoDate(o.date)) return { ok: false, error: "תאריך לא תקין" };
    value.task_date = o.date;
  }
  if (o.done !== undefined) {
    if (typeof o.done !== "boolean") return { ok: false, error: "בקשה לא חוקית" };
    value.done = o.done;
  }
  return { ok: true, value };
}

// Open tasks first, in the order they were added; done ones after them, in the order they were done.
export function sortTasks<T extends Pick<TaskRow, "done" | "done_at" | "created_at">>(tasks: readonly T[]): T[] {
  return [...tasks].sort((a, b) => {
    if (a.done !== b.done) return a.done ? 1 : -1;
    if (a.done) return (a.done_at ?? "").localeCompare(b.done_at ?? "");
    return a.created_at.localeCompare(b.created_at);
  });
}

// The header button's number: open tasks for today and open ones left from earlier days.
export function openTasksDue(tasks: readonly Pick<TaskRow, "task_date" | "done">[], today: string): number {
  return tasks.filter((t) => !t.done && t.task_date <= today).length;
}

// A horizontal swipe on a task, in screen pixels: far enough right toggles it done, far enough left
// deletes it (physical directions, in both languages, owner's choice). Within the threshold nothing
// happens and the row slides back.
export const SWIPE_MIN_PX = 72;
export function swipeAction(dx: number, width: number): "toggle" | "delete" | null {
  const threshold = Math.max(SWIPE_MIN_PX, Math.min(140, width * 0.3));
  if (dx >= threshold) return "toggle";
  if (dx <= -threshold) return "delete";
  return null;
}

// The day's name over the list: today, tomorrow, yesterday, else the weekday. The date itself is
// shown beside it.
export function dayName(date: string, today: string): "today" | "tomorrow" | "yesterday" | "other" {
  if (date === today) return "today";
  if (date === shiftDate(today, 1)) return "tomorrow";
  if (date === shiftDate(today, -1)) return "yesterday";
  return "other";
}
