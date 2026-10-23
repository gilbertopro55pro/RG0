import type { AlbumElement, AlbumPhotoElement, AlbumShapeElement } from "@/lib/types";

// Pure geometry behind a few of the free album editor's tools (AlbumSpreadCanvasEditor.tsx), kept
// here so they can be tested without a browser: the shape layer behind a group of photos, moving a
// shape under/over the photos, snapping a moved box (one element or a whole selection) to the
// edges of the other elements, and the size of each page in the editor's page strip. Every value
// is a percentage of the page (0-100 on each axis, left-to-right / top-to-bottom), like the
// elements themselves.

export type PctBox = { xPct: number; yPct: number; widthPct: number; heightPct: number };
export type PageSize = { width_cm: number; height_cm: number };

// An element's edges and center. A text element without a stored height counts as 15% tall, the
// same fallback the editor draws it with.
export function layerBox(el: AlbumElement): { left: number; top: number; right: number; bottom: number; centerX: number; centerY: number } {
  const height = el.type === "photo" ? el.heightPct : (el.heightPct ?? 15);
  return {
    left: el.xPct,
    top: el.yPct,
    right: el.xPct + el.widthPct,
    bottom: el.yPct + height,
    centerX: el.xPct + el.widthPct / 2,
    centerY: el.yPct + height / 2,
  };
}

// The smallest box around all of these boxes.
export function groupBounds(boxes: PctBox[]): PctBox {
  const left = Math.min(...boxes.map((b) => b.xPct));
  const top = Math.min(...boxes.map((b) => b.yPct));
  const right = Math.max(...boxes.map((b) => b.xPct + b.widthPct));
  const bottom = Math.max(...boxes.map((b) => b.yPct + b.heightPct));
  return { xPct: left, yPct: top, widthPct: right - left, heightPct: bottom - top };
}

// ---------------------------------------------------------------------------------------------
// A shape as a layer under photos (owner: "הוספת צורות כשכבה מתחת לתמונות כמו מלבן לבן בשקיפות 35%
// בצבע לבן מאחורי קבוצת תמונות").

// The rectangle reaches this far past the selected photos on every side, in real cm, so it shows
// as an even frame around the group whatever the page's proportions.
export const SHAPE_BEHIND_PADDING_CM = 0.7;
export const SHAPE_BEHIND_COLOR = "#ffffff";
export const SHAPE_BEHIND_OPACITY = 35;

// An id no element on the page has yet: `${prefix}-1`, `${prefix}-2`, ... (ids only have to be
// unique within a page — they key the elements and their own layers).
export function freeLayerId(elements: AlbumElement[], prefix: string): string {
  const taken = new Set(elements.map((el) => el.id));
  let n = 1;
  while (taken.has(`${prefix}-${n}`)) n++;
  return `${prefix}-${n}`;
}

// A white 35% rectangle around the given photos (plus the padding, kept on the page), inserted in
// the element order just before the lowest of them: it sits under the whole group and above
// everything that was under the group. null when none of the ids is a photo on this page.
export function shapeBehindPhotos(elements: AlbumElement[], photoIds: Iterable<string>, page: PageSize, id: string): AlbumElement[] | null {
  const ids = new Set(photoIds);
  const photoIdx = elements.flatMap((el, i) => (el.type === "photo" && ids.has(el.id) ? [i] : []));
  if (photoIdx.length === 0) return null;
  const bounds = groupBounds(elements.filter((el): el is AlbumPhotoElement => el.type === "photo" && ids.has(el.id)));
  const padX = page.width_cm > 0 ? (SHAPE_BEHIND_PADDING_CM / page.width_cm) * 100 : 0;
  const padY = page.height_cm > 0 ? (SHAPE_BEHIND_PADDING_CM / page.height_cm) * 100 : 0;
  const left = Math.max(0, bounds.xPct - padX);
  const top = Math.max(0, bounds.yPct - padY);
  const right = Math.min(100, bounds.xPct + bounds.widthPct + padX);
  const bottom = Math.min(100, bounds.yPct + bounds.heightPct + padY);
  const shape: AlbumShapeElement = {
    id,
    type: "shape",
    xPct: left,
    yPct: top,
    widthPct: right - left,
    heightPct: bottom - top,
    color: SHAPE_BEHIND_COLOR,
    opacity: SHAPE_BEHIND_OPACITY,
    rotation: 0,
  };
  const at = Math.min(...photoIdx);
  return [...elements.slice(0, at), shape, ...elements.slice(at)];
}

// Moves a shape just below (or just above) the photos it overlaps — every one of them, in one
// step, unlike the one-layer-at-a-time buttons — so a shape added the normal way can be sent under
// a group of photos too. A shape overlapping no photo goes below/above all the photos on the page.
// Returns the same array (no change) when the shape is already there, or there's nothing to do.
export function moveShapeAroundPhotos(elements: AlbumElement[], shapeId: string, where: "below" | "above"): AlbumElement[] {
  const i = elements.findIndex((el) => el.id === shapeId);
  if (i < 0 || elements[i].type !== "shape") return elements;
  const box = layerBox(elements[i]);
  const photoIdx = elements.flatMap((el, k) => (el.type === "photo" ? [k] : []));
  const overlapping = photoIdx.filter((k) => {
    const b = layerBox(elements[k]);
    return b.left < box.right && b.right > box.left && b.top < box.bottom && b.bottom > box.top;
  });
  const targets = overlapping.length > 0 ? overlapping : photoIdx;
  if (targets.length === 0) return elements;
  const next = elements.filter((_, k) => k !== i);
  if (where === "below") {
    const lowest = Math.min(...targets);
    if (i < lowest) return elements;
    // `lowest` is below the shape, so removing the shape didn't shift it.
    next.splice(lowest, 0, elements[i]);
  } else {
    const highest = Math.max(...targets);
    if (i > highest) return elements;
    // `highest` was above the shape and slid down one place when the shape was removed, so index
    // `highest` is now just above it.
    next.splice(highest, 0, elements[i]);
  }
  return next;
}

// ---------------------------------------------------------------------------------------------
// Snapping while moving (owner: "אפקט נעיצה במסגרת הירוקה ובגבולות תמונות סמוכות כאשר מסומנות תמונה
// או תמונות יחד").

export type SnapGuide = { axis: "v" | "h"; pos: number };

// The moved box — one element, or the bounding box of a whole selection — against the page's
// center lines and every other element: its left/right edge onto another element's left OR right
// edge (lined up with it, or sitting flush against it), its center onto the other's center, and the
// same on the vertical axis. The nearest line within `threshold` wins on each axis, and a guide is
// returned for every line the snapped box then actually touches.
export function computeMoveAlignment(
  box: PctBox,
  others: AlbumElement[],
  threshold: number
): { guides: SnapGuide[]; snapXPct?: number; snapYPct?: number } {
  const left = box.xPct;
  const right = box.xPct + box.widthPct;
  const centerX = box.xPct + box.widthPct / 2;
  const top = box.yPct;
  const bottom = box.yPct + box.heightPct;
  const centerY = box.yPct + box.heightPct / 2;
  // [edge of the moved box, line it can snap onto]
  const xPairs: [number, number][] = [[centerX, 50]];
  const yPairs: [number, number][] = [[centerY, 50]];
  for (const other of others) {
    const b = layerBox(other);
    xPairs.push([left, b.left], [left, b.right], [right, b.right], [right, b.left], [centerX, b.centerX]);
    yPairs.push([top, b.top], [top, b.bottom], [bottom, b.bottom], [bottom, b.top], [centerY, b.centerY]);
  }
  const solve = (pairs: [number, number][], axis: "v" | "h") => {
    let shift: number | undefined;
    for (const [edge, line] of pairs) {
      const d = line - edge;
      if (Math.abs(d) < threshold && (shift === undefined || Math.abs(d) < Math.abs(shift))) shift = d;
    }
    if (shift === undefined) return { guides: [] as SnapGuide[], shift };
    const s = shift;
    const lines = [...new Set(pairs.filter(([edge, line]) => Math.abs(edge + s - line) < 1e-6).map(([, line]) => line))];
    return { guides: lines.map((pos) => ({ axis, pos })), shift };
  };
  const x = solve(xPairs, "v");
  const y = solve(yPairs, "h");
  return {
    guides: [...x.guides, ...y.guides],
    snapXPct: x.shift === undefined ? undefined : box.xPct + x.shift,
    snapYPct: y.shift === undefined ? undefined : box.yPct + y.shift,
  };
}

// How far a whole group may move: the group's bounding box stays on the page (a member already
// past an edge, like an outline shape bled off on purpose, is never pushed further out, and never
// forces a jump back in either). One delta for every member keeps their relative positions exact.
export function clampGroupDelta(bounds: PctBox, dx: number, dy: number): { dx: number; dy: number } {
  const minDx = Math.min(0, -bounds.xPct);
  const maxDx = Math.max(0, 100 - (bounds.xPct + bounds.widthPct));
  const minDy = Math.min(0, -bounds.yPct);
  const maxDy = Math.max(0, 100 - (bounds.yPct + bounds.heightPct));
  return { dx: Math.max(minDx, Math.min(maxDx, dx)), dy: Math.max(minDy, Math.min(maxDy, dy)) };
}

// ---------------------------------------------------------------------------------------------
// The page strip under the canvas: each page at its own size (a 32×32 cover in a 60×30 album shows
// square). A page without a size of its own takes the album's size, `book`.
export function pageSizeOf(spread: { width_cm: number | null; height_cm: number | null }, book: PageSize): PageSize {
  return spread.width_cm && spread.height_cm ? { width_cm: spread.width_cm, height_cm: spread.height_cm } : book;
}

// ---------------------------------------------------------------------------------------------
// Resizing (owner 2026-10-20: "ברגע שמתחתי את קצה הקנבס המתיחה תיעצר שם", and snapping to the green
// frame while stretching a selection "לאורך, רוחב או באלכסון").

export type ResizeHandle = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";

function handleAxes(handle: ResizeHandle): { h: "w" | "e" | ""; v: "n" | "s" | "" } {
  return {
    h: handle.includes("w") ? "w" : handle.includes("e") ? "e" : "",
    v: handle.includes("n") ? "n" : handle.includes("s") ? "s" : "",
  };
}

// A box resized from one of its 8 handles. The opposite edge (or corner) never moves, and the
// dragged edge stops at the page edge: a drag past the edge leaves the box touching it instead of
// pushing the anchored side out the other way. With `symmetric` (Alt) both edges on the dragged
// axis move around the box's center, and stop together when the nearer one reaches the page edge.
// With `lockAspect` a corner drag keeps the box's proportions, also at the page edge. A box that
// already reaches past an edge is never forced back in, only kept from growing further out.
export function resizeWithinPage(
  handle: ResizeHandle,
  start: PctBox,
  dx: number,
  dy: number,
  opts: { lockAspect?: boolean; symmetric?: boolean; minW?: number; minH?: number } = {}
): PctBox {
  const { lockAspect = false, symmetric = false, minW = 8, minH = 6 } = opts;
  const { h, v } = handleAxes(handle);
  const mult = symmetric ? 2 : 1;
  let w = start.widthPct;
  let hgt = start.heightPct;
  if (h === "e") w += dx * mult;
  else if (h === "w") w -= dx * mult;
  if (v === "s") hgt += dy * mult;
  else if (v === "n") hgt -= dy * mult;

  const right = start.xPct + start.widthPct;
  const bottom = start.yPct + start.heightPct;
  const cx = start.xPct + start.widthPct / 2;
  const cy = start.yPct + start.heightPct / 2;
  const roomW = h === "" ? start.widthPct : symmetric ? 2 * Math.min(cx, 100 - cx) : h === "e" ? 100 - start.xPct : right;
  const roomH = v === "" ? start.heightPct : symmetric ? 2 * Math.min(cy, 100 - cy) : v === "s" ? 100 - start.yPct : bottom;
  const maxW = Math.max(roomW, start.widthPct, minW);
  const maxH = Math.max(roomH, start.heightPct, minH);

  if (lockAspect && h !== "" && v !== "" && start.widthPct > 0 && start.heightPct > 0) {
    const ratio = start.widthPct / start.heightPct;
    if (Math.abs(w / start.widthPct - 1) >= Math.abs(hgt / start.heightPct - 1)) hgt = w / ratio;
    else w = hgt * ratio;
    if (w > maxW) {
      w = maxW;
      hgt = w / ratio;
    }
    if (hgt > maxH) {
      hgt = maxH;
      w = hgt * ratio;
    }
  }
  w = Math.min(Math.max(minW, w), maxW);
  hgt = Math.min(Math.max(minH, hgt), maxH);

  const xPct = h === "" ? start.xPct : symmetric ? cx - w / 2 : h === "w" ? right - w : start.xPct;
  const yPct = v === "" ? start.yPct : symmetric ? cy - hgt / 2 : v === "n" ? bottom - hgt : start.yPct;
  return { xPct, yPct, widthPct: w, heightPct: hgt };
}

// The lines a resized box's moving edges can snap onto: the page edges and center, the green
// print-safe frame, and every other element's edges (the ones not being resized).
export function resizeSnapTargets(others: AlbumElement[], margin: { x: number; y: number } | null): { x: number[]; y: number[] } {
  const x = [0, 50, 100];
  const y = [0, 50, 100];
  if (margin) {
    x.push(margin.x, 100 - margin.x);
    y.push(margin.y, 100 - margin.y);
  }
  for (const o of others) {
    const b = layerBox(o);
    x.push(b.left, b.right);
    y.push(b.top, b.bottom);
  }
  return { x, y };
}

// Snaps the moving edge(s) of a box being resized from `handle` onto the nearest target line
// within `threshold`, each axis on its own; the anchored edges stay put. With `lockAspect` on a
// corner the nearer of the two snaps wins and the other side follows the proportions, so the box
// never loses its shape to a snap. A snap that would take the box off the page, or below the
// minimum size, is skipped. Not used with a symmetric (Alt) resize.
export function snapResizeBox(
  handle: ResizeHandle,
  box: PctBox,
  targets: { x: number[]; y: number[] },
  threshold: number,
  opts: { lockAspect?: boolean; minW?: number; minH?: number } = {}
): { box: PctBox; guides: SnapGuide[]; hitX?: number; hitY?: number } {
  const { lockAspect = false, minW = 8, minH = 6 } = opts;
  const { h, v } = handleAxes(handle);
  const left = box.xPct;
  const right = box.xPct + box.widthPct;
  const top = box.yPct;
  const bottom = box.yPct + box.heightPct;
  const nearest = (edge: number, lines: number[]) => {
    let best: number | undefined;
    for (const t of lines) if (Math.abs(t - edge) < threshold && (best === undefined || Math.abs(t - edge) < Math.abs(best - edge))) best = t;
    return best;
  };
  const onPage = (b: PctBox) => b.xPct >= -1e-6 && b.yPct >= -1e-6 && b.xPct + b.widthPct <= 100 + 1e-6 && b.yPct + b.heightPct <= 100 + 1e-6 && b.widthPct >= minW - 1e-6 && b.heightPct >= minH - 1e-6;

  // The box with its moving horizontal edge on line `t` (or vertical, below).
  const withX = (b: PctBox, t: number): PctBox => (h === "e" ? { ...b, widthPct: t - b.xPct } : { ...b, xPct: t, widthPct: b.xPct + b.widthPct - t });
  const withY = (b: PctBox, t: number): PctBox => (v === "s" ? { ...b, heightPct: t - b.yPct } : { ...b, yPct: t, heightPct: b.yPct + b.heightPct - t });
  const hitX = h === "" ? undefined : nearest(h === "e" ? right : left, targets.x);
  const hitY = v === "" ? undefined : nearest(v === "s" ? bottom : top, targets.y);

  if (lockAspect && h !== "" && v !== "" && box.heightPct > 0) {
    const ratio = box.widthPct / box.heightPct;
    const dX = hitX === undefined ? Infinity : Math.abs(hitX - (h === "e" ? right : left));
    const dY = hitY === undefined ? Infinity : Math.abs(hitY - (v === "s" ? bottom : top));
    if (dX === Infinity && dY === Infinity) return { box, guides: [] };
    let out: PctBox;
    if (dX <= dY) {
      out = withX(box, hitX!);
      const nh = out.widthPct / ratio;
      out = v === "s" ? { ...out, heightPct: nh } : { ...out, yPct: bottom - nh, heightPct: nh };
    } else {
      out = withY(box, hitY!);
      const nw = out.heightPct * ratio;
      out = h === "e" ? { ...out, widthPct: nw } : { ...out, xPct: right - nw, widthPct: nw };
    }
    if (!onPage(out)) return { box, guides: [] };
    const guides: SnapGuide[] = [];
    const outRight = out.xPct + out.widthPct;
    const outBottom = out.yPct + out.heightPct;
    const gx = h === "e" ? outRight : out.xPct;
    const gy = v === "s" ? outBottom : out.yPct;
    const lineX = targets.x.find((t) => Math.abs(t - gx) < 1e-6);
    const lineY = targets.y.find((t) => Math.abs(t - gy) < 1e-6);
    if (lineX !== undefined) guides.push({ axis: "v", pos: lineX });
    if (lineY !== undefined) guides.push({ axis: "h", pos: lineY });
    return { box: out, guides, hitX: lineX, hitY: lineY };
  }

  let out = box;
  const guides: SnapGuide[] = [];
  let usedX: number | undefined;
  let usedY: number | undefined;
  if (hitX !== undefined) {
    const next = withX(out, hitX);
    if (onPage(next)) {
      out = next;
      usedX = hitX;
      guides.push({ axis: "v", pos: hitX });
    }
  }
  if (hitY !== undefined) {
    const next = withY(out, hitY);
    if (onPage(next)) {
      out = next;
      usedY = hitY;
      guides.push({ axis: "h", pos: hitY });
    }
  }
  return { box: out, guides, hitX: usedX, hitY: usedY };
}

// ---------------------------------------------------------------------------------------------
// The corner controls of a selected text (owner, 2026-10-23, LayerControls.tsx): "+1" and the
// size control.

// The letters' size range, the same as the text panel's slider.
export const TEXT_FONT_SIZE_RANGE = { min: 2, max: 250 };

// A text made bigger or smaller from its size control: the letters and the box grow together by
// the same factor around the box's center, so the text keeps its place, its line breaks and its
// turn. `fontSize` is the new size the drag asked for; it's held to the slider's range and the box
// follows whatever size was kept.
export function scaleTextBox(start: PctBox & { fontSize: number }, fontSize: number): PctBox & { fontSize: number } {
  const size = Math.round(Math.min(TEXT_FONT_SIZE_RANGE.max, Math.max(TEXT_FONT_SIZE_RANGE.min, fontSize)) * 10) / 10;
  const ratio = start.fontSize > 0 ? size / start.fontSize : 1;
  const widthPct = start.widthPct * ratio;
  const heightPct = start.heightPct * ratio;
  const cx = start.xPct + start.widthPct / 2;
  const cy = start.yPct + start.heightPct / 2;
  return { xPct: cx - widthPct / 2, yPct: cy - heightPct / 2, widthPct, heightPct, fontSize: size };
}

// "+1": a copy of a text a little down and to the side (so it doesn't hide exactly behind the
// original), kept on the page, unlocked.
export function duplicatedText<T extends AlbumElement & { type: "text" }>(el: T, id: string, offsetPct = 3): T {
  const height = el.heightPct ?? 15;
  const x = Math.min(Math.max(0, 100 - el.widthPct), el.xPct + offsetPct);
  const y = Math.min(Math.max(0, 100 - height), el.yPct + offsetPct);
  return { ...el, id, xPct: x, yPct: y, locked: false };
}
