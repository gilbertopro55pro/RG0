import type { MagnetFrameElement } from "@/lib/types";

// Pure helpers behind the magnet frame editor's tools (owner, 2026-10-22: "מעולה ונח לתפעול"):
// undo/redo history, snapping while dragging, and element operations (duplicate, layer order).
// Kept out of the component so they're tested on their own (magnetFrameEditing.test.ts).

// --- Undo / redo ---
// A bounded stack of snapshots. `commit` records a new state after an edit settles (the editor
// debounces slider drags into one step); undo/redo move between them.
export type History<T> = { past: T[]; present: T; future: T[] };

export const HISTORY_LIMIT = 100;

export function historyStart<T>(present: T): History<T> {
  return { past: [], present, future: [] };
}

export function historyCommit<T>(h: History<T>, next: T, same: (a: T, b: T) => boolean = Object.is): History<T> {
  if (same(h.present, next)) return h;
  const past = [...h.past, h.present];
  return { past: past.length > HISTORY_LIMIT ? past.slice(past.length - HISTORY_LIMIT) : past, present: next, future: [] };
}

export function historyUndo<T>(h: History<T>): History<T> {
  if (h.past.length === 0) return h;
  return { past: h.past.slice(0, -1), present: h.past[h.past.length - 1], future: [h.present, ...h.future] };
}

export function historyRedo<T>(h: History<T>): History<T> {
  if (h.future.length === 0) return h;
  return { past: [...h.past, h.present], present: h.future[0], future: h.future.slice(1) };
}

// --- Snapping ---
// While dragging, an element's center catches the nearest line within `threshold` (in % of that
// axis): the frame's middle, the photo window's edges and middle, the middle of each mat strip,
// and the other elements' centers.
export type SnapLines = { x: number[]; y: number[] };

export function frameSnapLines(
  inset: { xPct: number; topPct: number; bottomPct: number },
  others: readonly { xPct: number; yPct: number }[]
): SnapLines {
  const windowTop = inset.topPct;
  const windowBottom = 100 - inset.bottomPct;
  const x = [50, inset.xPct, 100 - inset.xPct, inset.xPct / 2, 100 - inset.xPct / 2, ...others.map((o) => o.xPct)];
  const y = [50, windowTop, windowBottom, (windowTop + windowBottom) / 2, windowTop / 2, (windowBottom + 100) / 2, ...others.map((o) => o.yPct)];
  return { x, y };
}

export function snapValue(raw: number, lines: readonly number[], threshold: number): { value: number; line: number | null } {
  let best: number | null = null;
  for (const line of lines) {
    if (Math.abs(raw - line) <= threshold && (best === null || Math.abs(raw - line) < Math.abs(raw - best))) best = line;
  }
  return best === null ? { value: raw, line: null } : { value: best, line: best };
}

// Where a new text goes: a spot on the mat that's clear of what's already there (owner,
// 2026-10-22: a text added to a template landed on the template's names). Candidates in order of
// preference: the bottom mat's middle, its upper and lower thirds, the top mat's middle, then the
// bottom mat's sides. The first one at least `clearPct` from every other element's center wins;
// when none is, the one farthest from them. Distances are in % of the frame's width (`aspect` =
// height / width converts the vertical ones).
export function freeTextSpot(
  inset: { xPct: number; topPct: number; bottomPct: number },
  others: readonly { xPct: number; yPct: number }[],
  aspect: number,
  clearPct = 12
): { xPct: number; yPct: number } {
  const bottom = inset.bottomPct;
  const candidates = [
    { xPct: 50, yPct: 100 - bottom / 2 },
    { xPct: 50, yPct: 100 - bottom * 0.7 },
    { xPct: 50, yPct: 100 - bottom * 0.3 },
    { xPct: 50, yPct: inset.topPct / 2 },
    { xPct: 28, yPct: 100 - bottom / 2 },
    { xPct: 72, yPct: 100 - bottom / 2 },
  ];
  if (others.length === 0) return candidates[0];
  const clearance = (c: { xPct: number; yPct: number }) => Math.min(...others.map((o) => Math.hypot(o.xPct - c.xPct, (o.yPct - c.yPct) * aspect)));
  const free = candidates.find((c) => clearance(c) >= clearPct);
  if (free) return free;
  return candidates.reduce((best, c) => (clearance(c) > clearance(best) ? c : best));
}

// --- Rotation ---
// The angle of the pointer around the element's center, in degrees clockwise from "up" (screen
// coordinates, y down), and a rotation snapped to 45° steps when within `catchDeg` of one, or to
// `stepDeg` steps when given (Shift).
export function pointerAngleDeg(cx: number, cy: number, px: number, py: number): number {
  return (Math.atan2(px - cx, -(py - cy)) * 180) / Math.PI;
}

export function normalizeDeg(deg: number): number {
  let d = deg % 360;
  if (d > 180) d -= 360;
  if (d <= -180) d += 360;
  return Math.round(d * 10) / 10;
}

export function snapRotation(deg: number, stepDeg?: number, catchDeg = 4): number {
  const d = normalizeDeg(deg);
  if (stepDeg) return normalizeDeg(Math.round(d / stepDeg) * stepDeg);
  const nearest = Math.round(d / 45) * 45;
  return Math.abs(d - nearest) <= catchDeg ? normalizeDeg(nearest) : Math.round(d);
}

// --- Element operations ---
export function duplicateElement(el: MagnetFrameElement, newId: string, offsetPct = 3): MagnetFrameElement {
  const clamp = (n: number) => Math.min(97, Math.max(3, n));
  return { ...el, id: newId, xPct: clamp(el.xPct + offsetPct), yPct: clamp(el.yPct + offsetPct), locked: false } as MagnetFrameElement;
}

// Layer order: later elements are drawn on top (editor and export alike).
export type LayerMove = "forward" | "backward" | "front" | "back";

export function moveLayer<T extends { id: string }>(list: readonly T[], id: string, move: LayerMove): T[] {
  const i = list.findIndex((el) => el.id === id);
  if (i < 0) return [...list];
  const next = [...list];
  const [el] = next.splice(i, 1);
  const to = move === "front" ? next.length : move === "back" ? 0 : move === "forward" ? Math.min(next.length, i + 1) : Math.max(0, i - 1);
  next.splice(to, 0, el);
  return next;
}

export function canMoveLayer(list: readonly { id: string }[], id: string, move: LayerMove): boolean {
  const i = list.findIndex((el) => el.id === id);
  if (i < 0) return false;
  return move === "forward" || move === "front" ? i < list.length - 1 : i > 0;
}

// Resizing by dragging a handle: the new size follows the pointer's distance from the element's
// center, relative to where the drag started, within the allowed range.
export function resizeFromDrag(startSize: number, startDist: number, dist: number, min: number, max: number): number {
  if (startDist <= 0) return startSize;
  const next = startSize * (dist / startDist);
  return Math.round(Math.min(max, Math.max(min, next)) * 10) / 10;
}
