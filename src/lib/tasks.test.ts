import { afterEach, describe, expect, it, vi } from "vitest";
import {
  TASK_NOTES_MAX,
  TASK_TITLE_MAX,
  dayName,
  isIsoDate,
  israelToday,
  openTasksDue,
  parseTaskInput,
  shiftDate,
  sortTasks,
  swipeAction,
} from "@/lib/tasks";

// The daily to-do list (owner, 2026-10-26).

describe("parseTaskInput", () => {
  it("a new task needs a title and a date", () => {
    expect(parseTaskInput({ title: "  להתקשר לדנה  ", date: "2026-10-26" })).toEqual({
      ok: true,
      value: { title: "להתקשר לדנה", task_date: "2026-10-26" },
    });
    expect(parseTaskInput({ title: "   ", date: "2026-10-26" })).toEqual({ ok: false, error: "נא לכתוב את המשימה" });
    expect(parseTaskInput({ title: "x" })).toEqual({ ok: false, error: "תאריך לא תקין" });
    expect(parseTaskInput({ title: "x", date: "2026-02-30" })).toEqual({ ok: false, error: "תאריך לא תקין" });
  });

  it("the title is one line, cut at the maximum; notes keep their lines", () => {
    const r = parseTaskInput({ title: "א\nב\tג" + "ד".repeat(300), notes: " שורה 1\r\nשורה 2 ", date: "2026-10-26" });
    expect(r.ok && r.value.title?.startsWith("א ב ג")).toBe(true);
    expect(r.ok && r.value.title?.length).toBeLessThanOrEqual(TASK_TITLE_MAX);
    expect(r.ok && r.value.notes).toBe("שורה 1\nשורה 2");
    const long = parseTaskInput({ title: "x", notes: "נ".repeat(TASK_NOTES_MAX + 10), date: "2026-10-26" });
    expect(long.ok && long.value.notes?.length).toBe(TASK_NOTES_MAX);
  });

  it("empty notes are saved as none", () => {
    expect(parseTaskInput({ title: "x", notes: "  ", date: "2026-10-26" })).toEqual({ ok: true, value: { title: "x", notes: null, task_date: "2026-10-26" } });
  });

  it("an edit takes only what it sends", () => {
    expect(parseTaskInput({ done: true }, true)).toEqual({ ok: true, value: { done: true } });
    expect(parseTaskInput({ notes: "הערה" }, true)).toEqual({ ok: true, value: { notes: "הערה" } });
    expect(parseTaskInput({ title: "" }, true)).toEqual({ ok: false, error: "נא לכתוב את המשימה" });
    expect(parseTaskInput({ done: "yes" }, true)).toEqual({ ok: false, error: "בקשה לא חוקית" });
  });
});

describe("dates", () => {
  afterEach(() => vi.useRealTimers());

  it("today is Israel's date, also late at night elsewhere", () => {
    // 22:30 UTC on Oct 25 is already Oct 26 in Israel.
    expect(israelToday(new Date("2026-10-25T22:30:00Z"))).toBe("2026-10-26");
    expect(israelToday(new Date("2026-10-26T20:00:00Z"))).toBe("2026-10-26");
  });

  it("shiftDate crosses months and years", () => {
    expect(shiftDate("2026-10-31", 1)).toBe("2026-11-01");
    expect(shiftDate("2026-01-01", -1)).toBe("2025-12-31");
  });

  it("isIsoDate", () => {
    expect(isIsoDate("2026-10-26")).toBe(true);
    expect(isIsoDate("26/10/2026")).toBe(false);
    expect(isIsoDate(null)).toBe(false);
  });

  it("dayName", () => {
    expect(dayName("2026-10-26", "2026-10-26")).toBe("today");
    expect(dayName("2026-10-27", "2026-10-26")).toBe("tomorrow");
    expect(dayName("2026-10-25", "2026-10-26")).toBe("yesterday");
    expect(dayName("2026-11-02", "2026-10-26")).toBe("other");
  });
});

describe("sortTasks and the header count", () => {
  const task = (over: Partial<{ task_date: string; done: boolean; done_at: string | null; created_at: string }>) => ({
    task_date: "2026-10-26",
    done: false,
    done_at: null,
    created_at: "2026-10-26T08:00:00Z",
    ...over,
  });

  it("open tasks first in the order added, done ones after in the order done", () => {
    const a = task({ created_at: "2026-10-26T09:00:00Z" });
    const b = task({ created_at: "2026-10-26T08:00:00Z" });
    const c = task({ done: true, done_at: "2026-10-26T12:00:00Z" });
    const d = task({ done: true, done_at: "2026-10-26T10:00:00Z" });
    expect(sortTasks([c, a, d, b])).toEqual([b, a, d, c]);
  });

  it("counts open tasks for today and earlier days, not later ones or done ones", () => {
    expect(
      openTasksDue(
        [task({}), task({ task_date: "2026-10-20" }), task({ task_date: "2026-10-27" }), task({ done: true })],
        "2026-10-26"
      )
    ).toBe(2);
  });
});

describe("swipeAction", () => {
  it("far enough right toggles, far enough left deletes, a small move does nothing", () => {
    expect(swipeAction(120, 360)).toBe("toggle");
    expect(swipeAction(-120, 360)).toBe("delete");
    expect(swipeAction(40, 360)).toBeNull();
    expect(swipeAction(-40, 360)).toBeNull();
  });

  it("the distance grows with the row, within limits", () => {
    expect(swipeAction(100, 800)).toBeNull(); // 30% of 800 is capped at 140
    expect(swipeAction(141, 800)).toBe("toggle");
    expect(swipeAction(72, 100)).toBe("toggle"); // at least 72px
  });
});
