import type { AlbumElement, AlbumFrame, AlbumPhotoElement } from "@/lib/types";
import { fitAutoElements, fitFramesToSafeArea } from "@/lib/albumSafeArea";
import { generateTemplateFrames } from "@/lib/albumTemplateBank";
import { layoutSpread } from "./layouts";
import { frameElements, rankTemplates, templatesForCount, type FrameFinish } from "./templateFill";
import type { AutoStyleId, LayoutPhoto } from "./types";
import { collageLayout, type CollageCell } from "@/lib/collage/layout";

// "עיצוב מחדש" for one album page: the same photos in another design. Shared by the photographer's
// album preview (GalleryManageView) and the client's album view (api/gallery/[token]/album/edit,
// owner 2026-10-27), so both cycle through the same designs.

export type Rect = { xPct: number; yPct: number; widthPct: number; heightPct: number };

// The page's shape as the eye reads it: its frames relative to their bounding box (10% steps),
// mirror images being the same design.
export function designShape(rects: readonly Rect[]): string {
  if (!rects.length) return "";
  const key = (flip: boolean) => {
    const xs = rects.map((r) => (flip ? 100 - r.xPct - r.widthPct : r.xPct));
    const x0 = Math.min(...xs);
    const x1 = Math.max(...rects.map((r, i) => xs[i] + r.widthPct));
    const y0 = Math.min(...rects.map((r) => r.yPct));
    const y1 = Math.max(...rects.map((r) => r.yPct + r.heightPct));
    const nx = (v: number) => Math.round(((v - x0) / Math.max(1, x1 - x0)) * 10);
    const ny = (v: number) => Math.round(((v - y0) / Math.max(1, y1 - y0)) * 10);
    return rects.map((r, i) => `${nx(xs[i])}:${ny(r.yPct)}:${nx(xs[i] + r.widthPct)}:${ny(r.yPct + r.heightPct)}`).sort().join("|");
  };
  const a = key(false);
  const b = key(true);
  return a < b ? a : b;
}

const bleeds = (el: Rect) => el.xPct <= 0.5 || el.yPct <= 0.5 || el.xPct + el.widthPct >= 99.5 || el.yPct + el.heightPct >= 99.5;

// The page keeps its look: the finish of its photos that don't run to the edge, including none at
// all (modern's bare photos). Only a page with nothing but edge-to-edge photos gets a white frame and
// a shadow.
export function pageFinish(photoEls: readonly AlbumPhotoElement[]): FrameFinish {
  const inner = photoEls.filter((el) => !bleeds(el));
  const src = inner.find((el) => el.borderWidth || el.shadow) ?? inner[0];
  if (!src) return { borderWidth: 3, borderColor: "#ffffff", shadow: 35 };
  return { ...(src.borderWidth ? { borderWidth: src.borderWidth, borderColor: src.borderColor ?? "#ffffff" } : {}), ...(src.shadow ? { shadow: src.shadow } : {}) };
}

export type EngineLayout = { els: AlbumElement[]; photos: AlbumPhotoElement[] };

// The auto engine's structurally different compositions for the album's style (edge-to-edge hero,
// faded hero over a grid, half page, band...), each holding every photo. Computing all its variants
// takes a moment (most on a phone), so the photographer's preview caches them per page.
export function engineLayouts(p: {
  style: AutoStyleId;
  photos: LayoutPhoto[];
  pageIndex: number;
  widthCm: number;
  heightCm: number;
  inset: { x: number; y: number } | null;
}): EngineLayout[] {
  const out: EngineLayout[] = [];
  for (let v = 0; v < 14; v++) {
    const res = layoutSpread({ style: p.style, photos: p.photos, section: "event", spreadIndex: p.pageIndex, widthCm: p.widthCm, heightCm: p.heightCm, variant: v });
    const els = fitAutoElements(res.elements, p.inset, res.bleedIds ?? []).map((el) => ({ ...el, id: `${el.id}-rd${v}` })) as AlbumElement[];
    const photos = els.filter((el): el is AlbumPhotoElement => el.type === "photo");
    if (photos.length === p.photos.length) out.push({ els, photos });
  }
  return out;
}

// `engine`: the auto engine's composition (it keeps faces off a double page's fold by itself).
export type RedesignDesign = { rects: Rect[]; build: () => AlbumElement[]; engine?: boolean };

// Candidate designs, alternating (owner, 2026-09-30: "more varied and creative, never repeating"):
// the engine's compositions and the library's templates (framed grids, the photographer's own
// first). The library alone was all grids, so every click read the same. With few photos the bank's
// 50 per tab hold only a handful of different shapes, so extra generated templates join them.
export function redesignDesigns(p: {
  engine: EngineLayout[];
  photos: LayoutPhoto[];
  userTemplates: AlbumFrame[][];
  widthCm: number;
  heightCm: number;
  inset: { x: number; y: number } | null;
  elements: readonly AlbumElement[];
  idPrefix: string;
  // More frame layouts to rank with the library's (the client's redesign adds collage layouts made
  // for these very photos, collageTemplates).
  extraTemplates?: AlbumFrame[][];
}): RedesignDesign[] {
  const n = p.photos.length;
  const extra = Array.from({ length: 120 }, (_, k) => generateTemplateFrames(n, 104729 + k * 7919));
  const templates = rankTemplates([...(p.extraTemplates ?? []), ...templatesForCount(n, p.userTemplates), ...extra], p.photos, p.widthCm, p.heightCm);
  const finish = pageFinish(p.elements.filter((el): el is AlbumPhotoElement => el.type === "photo" && !!el.photoId));
  const keptNonPhoto = p.elements.filter((el) => el.type !== "photo");
  const engine: RedesignDesign[] = p.engine.map(({ els, photos }) => ({
    engine: true,
    rects: photos,
    // The engine's own page dressing (page colour, tape, lines) replaces the page's previous auto
    // dressing; anything the photographer added (text, ornaments) stays.
    build: () => [
      ...els.filter((el) => el.type === "shape"),
      ...photos,
      ...keptNonPhoto.filter((el) => !(el.type === "shape" && el.id.startsWith("auto-"))),
      ...els.filter((el) => el.type !== "shape" && el.type !== "photo"),
    ],
  }));
  const library: RedesignDesign[] = templates.map((frames) => {
    const fitted = fitFramesToSafeArea(frames, p.inset);
    return {
      rects: fitted,
      build: () => {
        const placed = frameElements(fitted, p.photos, p.widthCm, p.heightCm, p.idPrefix, finish);
        return [...keptNonPhoto.filter((el) => el.type === "shape"), ...placed, ...keptNonPhoto.filter((el) => el.type !== "shape")];
      },
    };
  });
  const designs: RedesignDesign[] = [];
  for (let i = 0; i < Math.max(engine.length, library.length); i++) {
    if (engine[i]) designs.push(engine[i]);
    if (library[i]) designs.push(library[i]);
  }
  return designs;
}

// The next design to show: one not seen on this page yet, and not the shape of a neighbouring page
// (those come last, so two pages side by side don't look alike). When every design was seen, the
// round starts again (anything but the current page). `count` is where the previous click stopped.
export function chooseRedesign(
  designs: readonly RedesignDesign[],
  p: { current: string; seen: ReadonlySet<string>; neighbours: ReadonlySet<string>; count: number }
): { design: RedesignDesign | null; count: number; seen: Set<string> } {
  const seen = new Set(p.seen);
  seen.add(p.current);
  let count = p.count;
  let chosen: RedesignDesign | null = null;
  let nearNeighbour: RedesignDesign | null = null;
  let fallback: RedesignDesign | null = null;
  for (let attempt = 0; attempt < designs.length && !chosen; attempt++) {
    count++;
    const d = designs[count % designs.length];
    const shape = designShape(d.rects);
    if (seen.has(shape)) {
      if (!fallback && shape !== p.current) fallback = d;
    } else if (p.neighbours.has(shape)) {
      if (!nearNeighbour) nearNeighbour = d;
    } else chosen = d;
  }
  if (!chosen && nearNeighbour) chosen = nearNeighbour;
  if (!chosen) {
    chosen = fallback;
    seen.clear();
    seen.add(p.current);
  }
  if (chosen) seen.add(designShape(chosen.rects));
  return { design: chosen, count, seen };
}

// Frame layouts made for these photos (lib/collage/layout.ts): justified rows, columns, or a big photo
// beside the rest, every photo cropped as little as the page allows, with an even gap. The library's
// templates are mostly grids of one shape, so a page of portrait and landscape photos found almost
// nothing there that didn't cut a portrait to a strip. A double page is laid out half by half, so no
// photo sits on the fold. In the page's 0–100 box, before the safe area (fitFramesToSafeArea).
export function collageTemplates(photos: readonly LayoutPhoto[], widthCm: number, heightCm: number, marginCm: number, gapCm = 0.7): AlbumFrame[][] {
  if (photos.length < 2 || !(widthCm > 0) || !(heightCm > 0)) return [];
  const safeW = widthCm - 2 * marginCm;
  const safeH = heightCm - 2 * marginCm;
  if (!(safeW > 0) || !(safeH > 0)) return [];
  const toFrames = (cells: CollageCell[], x0: number, span: number, tag: string): AlbumFrame[] =>
    cells.map((c, i) => ({ id: `${tag}-${i}`, xPct: x0 + c.x * span, yPct: c.y * 100, widthPct: c.w * span, heightPct: c.h * 100 }));
  const out: AlbumFrame[][] = [];
  if (widthCm / heightCm < 1.6) {
    for (let v = 0; v < 16; v++) {
      const l = collageLayout([...photos], { aspect: safeW / safeH, gap: gapCm / safeW, variant: v });
      if (l) out.push(toFrames(l.cells, 0, 100, `cl${v}`));
    }
    return out;
  }
  // A double page: the photos split between its halves, each half its own collage. In their order,
  // and grouped by shape (two portraits side by side on one half, two landscapes one above the
  // other on the other), which is what fits a half page.
  const halfW = safeW / 2;
  const n = photos.length;
  const orders = [[...photos], [...photos].sort((a, b) => a.aspect - b.aspect), [...photos].sort((a, b) => b.aspect - a.aspect)];
  const splits = [...new Set([Math.floor(n / 2), Math.ceil(n / 2)])].filter((k) => k >= 1 && k < n);
  const done = new Set<string>();
  orders.forEach((order, o) => {
    for (const k of splits) {
      const key = `${order.slice(0, k).map((p) => p.id).sort().join(",")}|${k}`;
      if (done.has(key)) continue;
      done.add(key);
      for (let v = 0; v < 4; v++) {
        const halves = [order.slice(0, k), order.slice(k)].map((half) => collageLayout(half, { aspect: halfW / safeH, gap: gapCm / halfW, variant: v }));
        if (!halves[0] || !halves[1]) continue;
        out.push([...toFrames(halves[0].cells, 0, 50, `cl${o}${k}${v}a`), ...toFrames(halves[1].cells, 50, 50, `cl${o}${k}${v}b`)]);
      }
    }
  });
  return out;
}
