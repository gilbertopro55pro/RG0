"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import BodyPortal from "@/components/BodyPortal";
import MorningDigestSettings from "@/components/MorningDigestSettings";
import ViewToggle, { type ListOrGrid } from "@/components/ViewToggle";
import { useLang, useT } from "@/i18n/client";
import { dateLocale } from "@/i18n/config";
import {
  TASK_NOTES_MAX,
  TASK_TITLE_MAX,
  dayName,
  israelToday,
  openTasksDue,
  shiftDate,
  sortTasks,
  swipeAction,
  type TaskRow,
} from "@/lib/tasks";
import { currentPushStatus, type PushStatus } from "@/lib/pushStatus";

// The daily to-do list (owner, 2026-10-26, lib/tasks.ts): the tasks of a day, a row each with its
// notes on a smaller line, or blocks (the view is remembered on this device). New task at the top.
// Tick the box or swipe right: done (again: not done). Swipe left or double-tap: delete, with undo.
// A single tap edits the title and the notes. On today, open tasks left from earlier days come
// after, with "to today". At the bottom, the daily tasks reminder: on/off and its time
// (lib/morningDigest.ts), with a pointer to settings when phone notifications are off here.

const VIEW_KEY = "tasks_view";
const DOUBLE_TAP_MS = 260;

type Toast = { text: string; undo?: () => void };

export default function TasksPanel({
  photographerId,
  morningDigest,
  onMorningDigest,
  onClose,
  onCount,
  onChanged,
}: {
  photographerId: string;
  morningDigest: { enabled: boolean; minutes: number };
  onMorningDigest: (next: { enabled: boolean; minutes: number }) => void;
  onClose: () => void;
  // The header button's number, whenever today's list is on screen.
  onCount: (n: number) => void;
  onChanged: () => void;
}) {
  const t = useT();
  const lang = useLang();
  const locale = dateLocale(lang);
  const [today, setToday] = useState(() => israelToday());
  const [date, setDate] = useState(() => israelToday());
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [overdue, setOverdue] = useState<TaskRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [view, setView] = useState<ListOrGrid>(() => {
    try {
      return localStorage.getItem(VIEW_KEY) === "grid" ? "grid" : "list";
    } catch {
      return "list";
    }
  });
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [notesOpen, setNotesOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [pushStatus, setPushStatus] = useState<PushStatus>("loading");
  useEffect(() => {
    let cancelled = false;
    currentPushStatus()
      .then((s) => !cancelled && setPushStatus(s))
      .catch(() => !cancelled && setPushStatus("unsupported"));
    return () => {
      cancelled = true;
    };
  }, []);

  const showToast = useCallback((next: Toast) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast(next);
    toastTimer.current = setTimeout(() => setToast(null), 5000);
  }, []);
  useEffect(() => () => void (toastTimer.current && clearTimeout(toastTimer.current)), []);

  const changeView = (next: ListOrGrid) => {
    setView(next);
    try {
      localStorage.setItem(VIEW_KEY, next);
    } catch {}
  };

  // Another day: its list loads.
  const goTo = (next: string) => {
    if (next === date) return;
    setDate(next);
    setLoading(true);
    setLoadError(false);
    setEditingId(null);
  };

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/tasks?date=${date}`, { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) throw new Error(String(res.status));
        const data = (await res.json()) as { today: string; tasks: TaskRow[]; overdue: TaskRow[] };
        if (cancelled) return;
        setToday(data.today);
        setTasks(data.tasks);
        setOverdue(data.overdue);
      })
      .catch(() => !cancelled && setLoadError(true))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [date]);

  // The header's number follows today's list.
  useEffect(() => {
    if (date === today && !loading) onCount(openTasksDue([...tasks, ...overdue], today));
  }, [tasks, overdue, date, today, loading, onCount]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (editingId) setEditingId(null);
      else onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [editingId, onClose]);

  const failed = () => showToast({ text: t("השמירה נכשלה. נסו שוב.") });

  const replace = (task: TaskRow) => {
    setTasks((list) => (task.task_date === date ? (list.some((x) => x.id === task.id) ? list.map((x) => (x.id === task.id ? task : x)) : [...list, task]) : list.filter((x) => x.id !== task.id)));
    setOverdue((list) => list.map((x) => (x.id === task.id ? task : x)).filter((x) => !x.done && x.task_date < today));
  };

  const patch = async (task: TaskRow, body: Record<string, unknown>, optimistic: TaskRow) => {
    replace(optimistic);
    onChanged();
    const res = await fetch(`/api/tasks/${task.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
    const data = res?.ok ? ((await res.json()) as { task: TaskRow }) : null;
    if (data) replace(data.task);
    else {
      replace(task);
      failed();
    }
  };

  const add = async () => {
    if (!title.trim() || adding) return;
    setAdding(true);
    const res = await fetch("/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, notes, date }),
    }).catch(() => null);
    setAdding(false);
    const data = res?.ok ? ((await res.json()) as { task: TaskRow }) : null;
    if (!data) return failed();
    setTasks((list) => [...list, data.task]);
    setTitle("");
    setNotes("");
    setNotesOpen(false);
    onChanged();
  };

  const toggle = (task: TaskRow) =>
    patch(task, { done: !task.done }, { ...task, done: !task.done, done_at: task.done ? null : new Date().toISOString() });

  const remove = async (task: TaskRow) => {
    setTasks((list) => list.filter((x) => x.id !== task.id));
    setOverdue((list) => list.filter((x) => x.id !== task.id));
    setEditingId(null);
    onChanged();
    const res = await fetch(`/api/tasks/${task.id}`, { method: "DELETE" }).catch(() => null);
    if (!res?.ok) {
      replace(task);
      return failed();
    }
    showToast({
      text: t("המשימה נמחקה"),
      undo: async () => {
        setToast(null);
        const back = await fetch("/api/tasks", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: task.title, notes: task.notes, date: task.task_date, done: task.done }),
        }).catch(() => null);
        const data = back?.ok ? ((await back.json()) as { task: TaskRow }) : null;
        if (!data) return failed();
        replace(data.task);
      },
    });
  };

  const saveEdit = (task: TaskRow, next: { title: string; notes: string }) => {
    setEditingId(null);
    if (!next.title.trim()) return;
    if (next.title.trim() === task.title && (next.notes.trim() || null) === (task.notes ?? null)) return;
    void patch(task, { title: next.title, notes: next.notes }, { ...task, title: next.title.trim(), notes: next.notes.trim() || null });
  };

  const moveToToday = (task: TaskRow) => patch(task, { date: today }, { ...task, task_date: today });

  const name = dayName(date, today);
  const dateText = new Date(`${date}T12:00:00`).toLocaleDateString(locale, { day: "numeric", month: "numeric", year: date.slice(0, 4) === today.slice(0, 4) ? undefined : "numeric" });
  const label =
    name === "today"
      ? t("היום")
      : name === "tomorrow"
        ? t("מחר")
        : name === "yesterday"
          ? t("אתמול")
          : new Date(`${date}T12:00:00`).toLocaleDateString(locale, { weekday: "long" });
  const sorted = sortTasks(tasks);
  const openCount = tasks.filter((x) => !x.done).length;

  const item = (task: TaskRow, opts: { overdue?: boolean } = {}) => (
    <TaskItem
      key={task.id}
      task={task}
      view={view}
      editing={editingId === task.id}
      overdueLabel={opts.overdue ? new Date(`${task.task_date}T12:00:00`).toLocaleDateString(locale, { day: "numeric", month: "numeric" }) : null}
      onToggle={() => void toggle(task)}
      onDelete={() => void remove(task)}
      onEdit={() => setEditingId(task.id)}
      onSave={(next) => saveEdit(task, next)}
      onCancel={() => setEditingId(null)}
      onMoveToToday={opts.overdue ? () => void moveToToday(task) : undefined}
    />
  );

  return (
    <BodyPortal>
      <div className="fixed inset-0 z-[120] flex items-end sm:items-center justify-center" style={{ background: "rgba(28, 27, 25, 0.45)" }} onClick={onClose}>
        <div
          role="dialog"
          aria-label={t("המשימות שלי")}
          className="w-full sm:max-w-xl h-[88dvh] sm:h-auto sm:max-h-[85vh] flex flex-col rounded-t-3xl sm:rounded-3xl bg-paper shadow-sheet"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header: title, view, close; then the day. */}
          <div className="px-5 pt-5 pb-3 border-b border-line">
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold font-display me-auto">{t("המשימות שלי")}</h2>
              <ViewToggle view={view} onChange={changeView} />
              <button type="button" onClick={onClose} aria-label={t("סגירה")} className="shrink-0 h-9 w-9 rounded-full flex items-center justify-center text-ink-soft bg-white border border-line">
                ✕
              </button>
            </div>
            <div className="flex items-center gap-2 mt-3">
              <DayArrow dir="prev" label={t("היום הקודם")} onClick={() => goTo(shiftDate(date, -1))} />
              <label className="relative flex-1 min-w-0 h-10 rounded-xl bg-card border border-line flex items-center justify-center gap-2 cursor-pointer">
                <span className="text-sm font-semibold truncate">{label}</span>
                <span className="text-xs text-ink-soft font-data">{dateText}</span>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => e.target.value && goTo(e.target.value)}
                  aria-label={t("בחירת תאריך")}
                  className="absolute inset-0 opacity-0 cursor-pointer"
                />
              </label>
              <DayArrow dir="next" label={t("היום הבא")} onClick={() => goTo(shiftDate(date, 1))} />
            </div>
            {date !== today && (
              <button type="button" onClick={() => goTo(today)} className="mt-2 text-xs font-semibold underline underline-offset-2 text-ink">
                {t("חזרה להיום")}
              </button>
            )}
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4">
            {/* New task */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void add();
              }}
              className="mb-4"
            >
              <div className="flex gap-2">
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  maxLength={TASK_TITLE_MAX}
                  dir="auto"
                  placeholder={t("משימה חדשה")}
                  aria-label={t("משימה חדשה")}
                  className="flex-1 min-w-0 h-11 rounded-xl px-3 text-sm border border-line bg-white"
                />
                <button type="submit" disabled={!title.trim() || adding} className="shrink-0 h-11 rounded-xl px-4 text-sm font-semibold bg-ink text-white disabled:opacity-50">
                  {adding ? t("שומר...") : t("הוספה")}
                </button>
              </div>
              {notesOpen ? (
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  maxLength={TASK_NOTES_MAX}
                  rows={2}
                  dir="auto"
                  placeholder={t("הערות למשימה")}
                  className="w-full mt-2 rounded-xl px-3 py-2 text-sm border border-line bg-white resize-y"
                />
              ) : (
                <button type="button" onClick={() => setNotesOpen(true)} className="mt-1.5 text-xs font-semibold text-ink-soft">
                  + {t("הוספת הערות")}
                </button>
              )}
            </form>

            {loading ? (
              <div className="py-10 flex justify-center" aria-label={t("טוען…")}>
                <span className="h-6 w-6 rounded-full border-2 border-line border-t-ink animate-spin" />
              </div>
            ) : loadError ? (
              <p className="py-8 text-center text-sm text-rose">{t("לא הצלחנו לטעון. נסו שוב.")}</p>
            ) : (
              <>
                {sorted.length > 0 ? (
                  <>
                    <p className="text-xs text-ink-soft mb-2">
                      {openCount === 0 ? t("כל המשימות הושלמו") : t("{n} משימות פתוחות", { n: openCount })}
                    </p>
                    <TaskList view={view}>{sorted.map((task) => item(task))}</TaskList>
                  </>
                ) : (
                  <p className="py-8 text-center text-sm text-ink-soft">{t("אין משימות ליום הזה")}</p>
                )}

                {date === today && overdue.length > 0 && (
                  <div className="mt-6">
                    <h3 className="text-xs font-semibold text-ink-soft mb-2">{t("לא הושלמו מימים קודמים")}</h3>
                    <TaskList view={view}>{overdue.map((task) => item(task, { overdue: true }))}</TaskList>
                  </div>
                )}

                <div className="mt-6">
                  <MorningDigestSettings
                    photographerId={photographerId}
                    initialEnabled={morningDigest.enabled}
                    initialMinutes={morningDigest.minutes}
                    compact
                    onChange={onMorningDigest}
                  />
                  {morningDigest.enabled && (pushStatus === "off" || pushStatus === "denied" || pushStatus === "ios-install") && (
                    <p className="mt-1.5 text-xs text-ink-soft">
                      {t("ההתראות לטלפון לא מופעלות במכשיר הזה.")}{" "}
                      <Link href="/settings?tab=automation" onClick={onClose} className="font-semibold underline underline-offset-2 text-ink">
                        {t("להפעלה בהגדרות")}
                      </Link>
                    </p>
                  )}
                </div>

                <p className="mt-4 text-[11px] leading-relaxed text-ink-soft">
                  {t("לחיצה על משימה לעריכה. החלקה ימינה או הצ׳קבוקס מסמנים שהושלמה. החלקה שמאלה או לחיצה כפולה מוחקות.")}
                </p>
              </>
            )}
          </div>

          {toast && (
            <div className="mx-4 mb-4 rounded-xl px-4 py-3 flex items-center gap-3 text-sm bg-ink text-white" role="status">
              <span className="flex-1 min-w-0">{toast.text}</span>
              {toast.undo && (
                <button type="button" onClick={toast.undo} className="shrink-0 font-semibold underline underline-offset-2">
                  {t("ביטול")}
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </BodyPortal>
  );
}

function TaskList({ view, children }: { view: ListOrGrid; children: ReactNode }) {
  return view === "grid" ? (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">{children}</div>
  ) : (
    <div className="rounded-2xl border border-line bg-white divide-y divide-[var(--color-line)] overflow-hidden">{children}</div>
  );
}

function DayArrow({ dir, label, onClick }: { dir: "prev" | "next"; label: string; onClick: () => void }) {
  // In Hebrew the previous day is to the right.
  const path = dir === "prev" ? "M9 6l6 6-6 6" : "M15 6l-6 6 6 6";
  return (
    <button type="button" onClick={onClick} aria-label={label} className="shrink-0 h-10 w-10 rounded-xl bg-card border border-line flex items-center justify-center text-ink">
      <svg viewBox="0 0 24 24" width={18} height={18} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="ltr:rotate-180">
        <path d={path} />
      </svg>
    </button>
  );
}

// One task: a row (list) or a block (grid). Swipe right toggles done, left deletes; a single tap edits,
// a double tap deletes.
function TaskItem({
  task,
  view,
  editing,
  overdueLabel,
  onToggle,
  onDelete,
  onEdit,
  onSave,
  onCancel,
  onMoveToToday,
}: {
  task: TaskRow;
  view: ListOrGrid;
  editing: boolean;
  overdueLabel: string | null;
  onToggle: () => void;
  onDelete: () => void;
  onEdit: () => void;
  onSave: (next: { title: string; notes: string }) => void;
  onCancel: () => void;
  onMoveToToday?: () => void;
}) {
  const t = useT();
  const [dx, setDx] = useState(0);
  const drag = useRef<{ x: number; y: number; active: boolean; width: number } | null>(null);
  const swiped = useRef(false);
  const tapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => void (tapTimer.current && clearTimeout(tapTimer.current)), []);

  const isControl = (target: EventTarget | null) => target instanceof HTMLElement && !!target.closest("button, input, textarea, a");

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    // A touch swipe isn't followed by a click, so the flag is cleared here and not only in onTap.
    swiped.current = false;
    if (editing || isControl(e.target)) return;
    drag.current = { x: e.clientX, y: e.clientY, active: false, width: e.currentTarget.offsetWidth };
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d) return;
    const mx = e.clientX - d.x;
    const my = e.clientY - d.y;
    if (!d.active) {
      if (Math.abs(mx) > 10 && Math.abs(mx) > Math.abs(my)) {
        d.active = true;
        e.currentTarget.setPointerCapture(e.pointerId);
      } else if (Math.abs(my) > 10) {
        drag.current = null;
      }
      return;
    }
    setDx(mx);
  };
  const endDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    drag.current = null;
    if (!d?.active) return;
    swiped.current = true;
    const action = swipeAction(e.clientX - d.x, d.width);
    setDx(0);
    if (action === "toggle") onToggle();
    if (action === "delete") onDelete();
  };

  const onTap = () => {
    if (swiped.current) {
      swiped.current = false;
      return;
    }
    if (tapTimer.current) {
      clearTimeout(tapTimer.current);
      tapTimer.current = null;
      onDelete();
      return;
    }
    tapTimer.current = setTimeout(() => {
      tapTimer.current = null;
      onEdit();
    }, DOUBLE_TAP_MS);
  };

  const grid = view === "grid";
  const checkbox = (
    <button
      type="button"
      role="checkbox"
      aria-checked={task.done}
      aria-label={task.done ? t("סימון כלא הושלמה") : t("סימון שהושלמה")}
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      className="shrink-0 h-[22px] w-[22px] rounded-md flex items-center justify-center"
      style={task.done ? { background: "var(--color-sage)", border: "1px solid var(--color-sage)", color: "#fff" } : { border: "1.5px solid var(--color-ink-soft)", background: "#fff" }}
    >
      {task.done && (
        <svg viewBox="0 0 24 24" width={14} height={14} fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M20 6L9 17l-5-5" />
        </svg>
      )}
    </button>
  );

  if (editing) return <TaskEditor task={task} grid={grid} onSave={onSave} onCancel={onCancel} />;

  return (
    <div className={`relative overflow-hidden select-none ${grid ? "rounded-xl border border-line" : ""}`}>
      {/* What the swipe will do, under the item. */}
      {dx !== 0 && (
        <div
          className="absolute inset-0 flex items-center px-4 text-xs font-semibold text-white"
          style={{ background: dx > 0 ? "var(--color-sage)" : "var(--color-rose)", justifyContent: dx > 0 ? "flex-start" : "flex-end" }}
          dir="ltr"
          aria-hidden="true"
        >
          {dx > 0 ? (task.done ? t("לא הושלמה") : t("הושלמה")) : t("מחיקה")}
        </div>
      )}
      <div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={() => {
          drag.current = null;
          setDx(0);
        }}
        onClick={onTap}
        className={`relative bg-white cursor-pointer ${grid ? "p-3 h-full min-h-[96px] flex flex-col gap-2" : "px-3.5 py-3 flex items-start gap-3"}`}
        style={{ touchAction: "pan-y", transform: dx ? `translateX(${dx}px)` : undefined, transition: dx ? undefined : "transform 0.15s ease-out" }}
      >
        {grid ? (
          <div className="flex items-center justify-between gap-2">
            {checkbox}
            {overdueLabel && <span className="text-[10.5px] font-data text-ink-soft">{overdueLabel}</span>}
          </div>
        ) : (
          <span className="pt-px">{checkbox}</span>
        )}
        <div className="flex-1 min-w-0">
          <div
            className={`text-sm font-semibold [overflow-wrap:anywhere] ${grid ? "line-clamp-3" : ""} ${task.done ? "line-through text-ink-soft" : "text-ink"}`}
            dir="auto"
          >
            {task.title}
          </div>
          {task.notes && (
            <div className={`text-xs text-ink-soft mt-0.5 whitespace-pre-wrap [overflow-wrap:anywhere] ${grid ? "line-clamp-4" : "line-clamp-2"}`} dir="auto">
              {task.notes}
            </div>
          )}
          {!grid && overdueLabel && <div className="text-[10.5px] text-ink-soft font-data mt-1">{overdueLabel}</div>}
        </div>
        {onMoveToToday && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onMoveToToday();
            }}
            className={`shrink-0 rounded-lg px-2.5 py-1 text-[11px] font-semibold border border-line bg-card text-ink ${grid ? "self-start" : ""}`}
          >
            {t("להיום")}
          </button>
        )}
      </div>
    </div>
  );
}

// Editing a task's title and notes in place. Enter in the title saves, ESC (the panel's) cancels.
function TaskEditor({
  task,
  grid,
  onSave,
  onCancel,
}: {
  task: TaskRow;
  grid: boolean;
  onSave: (next: { title: string; notes: string }) => void;
  onCancel: () => void;
}) {
  const t = useT();
  const [draft, setDraft] = useState({ title: task.title, notes: task.notes ?? "" });
  return (
    <div className={`p-3 ${grid ? "rounded-xl border border-ink bg-white col-span-2 sm:col-span-3" : "bg-white"}`}>
      <input
        value={draft.title}
        onChange={(e) => setDraft({ ...draft, title: e.target.value })}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            onSave(draft);
          }
        }}
        maxLength={TASK_TITLE_MAX}
        autoFocus
        dir="auto"
        aria-label={t("המשימה")}
        className="w-full h-10 rounded-lg px-3 text-sm border border-line bg-white"
      />
      <textarea
        value={draft.notes}
        onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
        maxLength={TASK_NOTES_MAX}
        rows={2}
        dir="auto"
        placeholder={t("הערות למשימה")}
        className="w-full mt-2 rounded-lg px-3 py-2 text-sm border border-line bg-white resize-y"
      />
      <div className="flex items-center gap-2 mt-2">
        <button type="button" onClick={() => onSave(draft)} disabled={!draft.title.trim()} className="rounded-lg px-3.5 py-2 text-xs font-semibold bg-ink text-white disabled:opacity-50">
          {t("שמירה")}
        </button>
        <button type="button" onClick={onCancel} className="rounded-lg px-3 py-2 text-xs font-semibold text-ink-soft">
          {t("ביטול")}
        </button>
      </div>
    </div>
  );
}
