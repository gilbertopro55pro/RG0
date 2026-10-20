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
