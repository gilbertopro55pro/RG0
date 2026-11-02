import type { AlbumElement, AlbumPhotoElement, AlbumShapeElement, AlbumTextElement } from "@/lib/types";
import { LETTER_WIDTH } from "./catalogQuotes";
import type { CoverInput, LayoutInput, LayoutOutput, LayoutPhoto } from "./types";
import { faceCropFocal, packPhotos } from "./layouts";

// The catalog style, after the owner's reference book (2026-11-02, a bat mitzvah book of 18 spreads:
// "this is how I want the catalog style to look"). What the reference does, spread after spread:
//   - a photo is the page: the main photo bleeds across the whole spread (or its whole page), sharp,
//     never a white page with small framed photos on it;
//   - the other photos sit in ONE tight mosaic over the main photo's empty side, thin white lines
//     around them and narrow gaps (≈0.3cm), about 78% of the height, nearer the outer edge;
//   - or the other page is filled edge to edge with a mosaic, white gutters only;
//   - or two photos side by side fill each page, full height;
//   - or a page of one photo opposite a light page with framed photos;
//   - or a translucent white panel over the main photo, with a framed photo in it;
//   - or three photos in rounded hexagons with a thick white outline, opposite a full page photo;
//   - the cover: the photo in a circle with a translucent white ring, on a blurred copy of itself, and
//     the name in a thin white frame beside it.
// Every placement keeps the faces whole and off the fold (faceCropFocal), and the spreads change from
// one to the next (the type turns with the spread's position).
//
// A single page (30×20, 40×30) is laid out the same way in two halves, without a fold.

type Rect = { x: number; y: number; w: number; h: number };
type G = { W: number; H: number; double: boolean; pageW: number };
type Face = { x: number; y: number; width: number; height: number };

const LINE: Partial<AlbumPhotoElement> = { borderWidth: 1.5, borderColor: "#ffffff", shadow: 18 };
const FRAMED: Partial<AlbumPhotoElement> = { borderWidth: 4, borderColor: "#ffffff", shadow: 30 };
const HEX: Partial<AlbumPhotoElement> = { borderWidth: 6, borderColor: "#ffffff", shadow: 35, maskId: "shape-hexagon-rounded" };
// The most a photo is cut to fill its frame (the mosaics fill their page exactly).
const MAX_CROP = 1.45;
const HERO_CROP = 1.8;

export type CatalogType = "hero-grid" | "hero-page" | "pairs" | "page-framed" | "panel" | "hexagons" | "panorama" | "framed";

const CYCLES: Record<number, CatalogType[]> = {
  1: ["panorama"],
  2: ["hero-grid", "page-framed", "panel", "pairs"],
  3: ["hero-grid", "hero-page", "page-framed", "panel"],
  4: ["hero-grid", "hero-page", "hexagons", "pairs"],
  5: ["hero-grid", "hero-page"],
};

const r3 = (v: number) => Math.round(v * 1000) / 1000;

function geoOf(widthCm: number, heightCm: number): G {
  const W = widthCm > 0 ? widthCm : 60;
  const H = heightCm > 0 ? heightCm : 30;
  return { W, H, double: W / H >= 1.6, pageW: W / 2 };
}

const aspectOf = (p: LayoutPhoto) => (p.aspect > 0.05 && Number.isFinite(p.aspect) ? p.aspect : 1.5);
const facesOf = (p: LayoutPhoto): Face[] => (p.faces ?? []).filter((f) => f.width > 0 && f.height > 0);
const cropOf = (p: LayoutPhoto, r: Rect) => {
  const a = aspectOf(p);
  const f = r.w / r.h;
  return Math.max(a / f, f / a);
};
// The page `i` (0 = left, 1 = right) of the spread, or half of a single page.
const pageRect = (g: G, i: number): Rect => ({ x: i * g.pageW, y: 0, w: g.pageW, h: g.H });

function photoEl(id: string, p: LayoutPhoto, r: Rect, g: G, extra: Partial<AlbumPhotoElement> = {}, zone?: { x0: number; x1: number; y0?: number; y1?: number }): AlbumPhotoElement {
  const c = faceCropFocal(aspectOf(p), r.w / r.h, facesOf(p), zone);
  return {
    id,
    type: "photo",
    photoId: p.id,
    xPct: r3((r.x / g.W) * 100),
    yPct: r3((r.y / g.H) * 100),
    widthPct: r3((r.w / g.W) * 100),
    heightPct: r3((r.h / g.H) * 100),
    focalX: c.focalX,
    focalY: c.focalY,
    zoom: 100,
    ...extra,
  };
}

function shapeEl(id: string, r: Rect, g: G, color: string, extra: Partial<AlbumShapeElement> = {}): AlbumShapeElement {
  return {
    id,
    type: "shape",
    xPct: r3((r.x / g.W) * 100),
    yPct: r3((r.y / g.H) * 100),
    widthPct: r3((r.w / g.W) * 100),
    heightPct: r3((r.h / g.H) * 100),
    color,
    ...extra,
  };
}

// The spread's line (catalogQuotes.ts) or the cover's name: a handwritten face, as large as its box holds.
function titleEl(id: string, text: string, r: Rect, g: G, color: string, align: "left" | "center" | "right" = "center", font?: string): AlbumTextElement {
  const hebrew = /[֐-׿]/.test(text);
  // fontSize is points on the 1600pt-wide reference of the whole spread: as high as the box allows,
  // and narrow enough for the whole name to fit its width on one line (a letter of these faces is
  // about half its size wide; a long name like "יעל ואיתי, חתונה" overflowed the cover's frame).
  const byHeight = ((r.h * 0.62) / g.W) * 1600;
  const family = font ?? (hebrew ? "gveret-levin" : "great-vibes");
  const byWidth = ((r.w / g.W) * 1600) / (Math.max(1, [...text].length) * (LETTER_WIDTH[family] ?? 0.52));
  const fontSize = Math.round(Math.min(byHeight, byWidth));
  return {
    id,
    type: "text",
    text,
    xPct: r3((r.x / g.W) * 100),
    yPct: r3((r.y / g.H) * 100),
    widthPct: r3((r.w / g.W) * 100),
    heightPct: r3((r.h / g.H) * 100),
    fontSize,
    color,
    align,
    fontFamily: family,
    shadow: color === "#ffffff" ? 45 : undefined,
  };
}

// Do the photo's faces, once it covers `frame` with its crop, all land inside `zone` (spread cm)?
function facesInside(p: LayoutPhoto, frame: Rect, zone: Rect, focalX: number, focalY: number): boolean {
  const faces = facesOf(p);
  if (!faces.length) return false;
  const a = aspectOf(p);
  const fa = frame.w / frame.h;
  // The visible window of the photo (fractions), as computePhotoFraming draws it.
  const vx = a > fa ? fa / a : 1;
  const vy = a < fa ? a / fa : 1;
  const sx = (1 - vx) * (focalX / 100);
  const sy = (1 - vy) * (focalY / 100);
  return faces.every((f) => {
    const x0 = frame.x + ((f.x - sx) / vx) * frame.w;
    const x1 = frame.x + ((f.x + f.width - sx) / vx) * frame.w;
    const y0 = frame.y + ((f.y - sy) / vy) * frame.h;
    return x0 >= zone.x && x1 <= zone.x + zone.w && y0 >= zone.y - 1e-6;
  });
}

// The photo's faces as spread rects (cm), as it covers `frame` with its crop.
function faceRects(p: LayoutPhoto, frame: Rect, focalX: number, focalY: number): Rect[] {
  const a = aspectOf(p);
  const fa = frame.w / frame.h;
  const vx = a > fa ? fa / a : 1;
  const vy = a < fa ? a / fa : 1;
  const sx = (1 - vx) * (focalX / 100);
  const sy = (1 - vy) * (focalY / 100);
  return facesOf(p).map((f) => {
    const x0 = frame.x + ((f.x - sx) / vx) * frame.w;
    const y0 = frame.y + ((f.y - sy) / vy) * frame.h;
    const w = (f.width / vx) * frame.w;
    const h = (f.height / vy) * frame.h;
    // The head's whole height: hair above, the chin below.
    return { x: x0 - 0.15 * w, y: y0 - 0.45 * h, w: w * 1.3, h: h * 1.9 };
  });
}

const overlaps = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

// The title goes in the first of `boxes` that covers no face and no framed photo.
function placeTitle(ctx: Ctx, els: AlbumElement[], boxes: Rect[], color: string): AlbumTextElement | null {
  if (!ctx.title) return null;
  const { g } = ctx;
  const blocked: Rect[] = [];
  for (const e of els) {
    if (e.type !== "photo") continue;
    const frame = { x: (e.xPct / 100) * g.W, y: (e.yPct / 100) * g.H, w: (e.widthPct / 100) * g.W, h: (e.heightPct / 100) * g.H };
    const p = ctx.photos.find((q) => q.id === e.photoId);
    if (p) blocked.push(...faceRects(p, frame, e.focalX, e.focalY));
    if (e.borderWidth) blocked.push(frame);
  }
  const box = boxes.find((b) => b.x >= 0 && b.x + b.w <= g.W + 1e-6 && !blocked.some((r) => overlaps(r, b)));
  return box ? titleEl(`${ctx.prefix}-title`, ctx.title, box, g, color, "center", ctx.titleFont) : null;
}

// The best main photo for a frame: its faces fit the zone, cut as little as possible, the closest
// face first. Null when none fits.
function pickHero(photos: LayoutPhoto[], frame: Rect, zone: Rect, maxCrop: number): { idx: number; focalX: number; focalY: number } | null {
  let best: { idx: number; focalX: number; focalY: number; score: number } | null = null;
  photos.forEach((p, idx) => {
    const crop = cropOf(p, frame);
    if (crop > maxCrop) return;
    const z = { x0: (zone.x - frame.x) / frame.w, x1: (zone.x + zone.w - frame.x) / frame.w };
    const c = faceCropFocal(aspectOf(p), frame.w / frame.h, facesOf(p), z);
    if (!c.fits || !facesInside(p, frame, zone, c.focalX, c.focalY)) return;
    const faceArea = Math.max(0, ...facesOf(p).map((f) => f.width * f.height));
    const score = -crop + Math.min(0.15, faceArea * 2);
    if (!best || score > best.score) best = { idx, focalX: c.focalX, focalY: c.focalY, score };
  });
  const b = best as { idx: number; focalX: number; focalY: number } | null;
  return b ? { idx: b.idx, focalX: b.focalX, focalY: b.focalY } : null;
}

const without = (photos: LayoutPhoto[], idx: number) => photos.filter((_, i) => i !== idx);

// A mosaic of `photos` filling `region` exactly, with gaps `gap`: the packer's arrangement stretched to
// the region, accepted while no photo is cut more than MAX_CROP.
function fillMosaic(photos: LayoutPhoto[], region: Rect, gap: number): Rect[] | null {
  const res = packPhotos(photos.map((p) => ({ id: p.id, aspect: aspectOf(p) })), region, gap, { permute: photos.length <= 4, maxStretch: 1.35 });
  if (!res) return null;
  const sx = region.w / res.used.w;
  const sy = region.h / res.used.h;
  const out: Rect[] = new Array(photos.length);
  for (const pl of res.placed) {
    const r = pl.r;
    // Positions scale; each gap stays `gap` by growing the frames instead.
    const x0 = region.x + (r.x - res.used.x) * sx;
    const y0 = region.y + (r.y - res.used.y) * sy;
    const x1 = region.x + (r.x + r.w - res.used.x) * sx;
    const y1 = region.y + (r.y + r.h - res.used.y) * sy;
    out[pl.idx] = { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  }
  // Re-close the gaps the scaling widened: snap every inner edge to its neighbour minus the gap.
  for (const a of out) {
    for (const b of out) {
      if (a === b) continue;
      const overlapY = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y) > 0.01;
      const overlapX = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x) > 0.01;
      if (overlapY && b.x > a.x + a.w - 0.01 && b.x - (a.x + a.w) < gap * 3) a.w = b.x - gap - a.x;
      if (overlapX && b.y > a.y + a.h - 0.01 && b.y - (a.y + a.h) < gap * 3) a.h = b.y - gap - a.y;
    }
  }
  for (const a of out) {
    if (Math.abs(a.x + a.w - (region.x + region.w)) < gap * 3) a.w = region.x + region.w - a.x;
    if (Math.abs(a.y + a.h - (region.y + region.h)) < gap * 3) a.h = region.y + region.h - a.y;
  }
  if (out.some((r, i) => !r || cropOf(photos[i], r) > MAX_CROP)) return null;
  return out;
}

// A block of `photos` inside `region` at their own shapes (cut ≤1.2), aligned as asked. A block that
// stays low in a tall region (the reference's mosaics stand ~78% of the page's height) grows taller,
// its photos cut a little more (≤1.35), as long as it still fits.
function block(photos: LayoutPhoto[], region: Rect, gap: number, alignX: "start" | "center" | "end"): Rect[] | null {
  const res = packPhotos(photos.map((p) => ({ id: p.id, aspect: aspectOf(p) })), region, gap, { permute: photos.length <= 4, maxStretch: 1.2, alignX, alignY: "center" });
  if (!res) return null;
  let out: Rect[] = new Array(photos.length);
  for (const pl of res.placed) out[pl.idx] = pl.r;
  const used = res.used;
  if (used.h < 0.9 * region.h) {
    for (const sy of [region.h / used.h, 1.3, 1.2, 1.1]) {
      const k = Math.min(sy, region.h / used.h);
      if (k <= 1.01) break;
      const top = region.y + (region.h - used.h * k) / 2;
      // Rows keep their gaps: the frames grow, the gaps don't.
      const grown = out.map((r) => ({ x: r.x, y: top + (r.y - used.y) * k, w: r.w, h: r.h * k }));
      for (const a of grown) {
        for (const b of grown) {
          const overlapX = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x) > 0.01;
          if (a !== b && overlapX && b.y > a.y && b.y - (a.y + a.h) < gap) a.h = b.y - gap - a.y;
        }
      }
      if (grown.every((r, i) => cropOf(photos[i], r) <= 1.35)) {
        out = grown;
        break;
      }
    }
  }
  return out;
}

// One photo at its own shape, as large as `region` holds, centred.
function fitIn(p: LayoutPhoto, region: Rect): Rect {
  const a = aspectOf(p);
  let w = region.w;
  let h = w / a;
  if (h > region.h) {
    h = region.h;
    w = h * a;
  }
  return { x: region.x + (region.w - w) / 2, y: region.y + (region.h - h) / 2, w, h };
}

type Built = { elements: AlbumElement[]; bleedIds: string[]; background?: LayoutOutput["background"] };

// `title`: the page's line (a short English quote, catalogQuotes.ts), in `titleFont`.
type Ctx = { g: G; photos: LayoutPhoto[]; prefix: string; gap: number; title?: string; titleFont?: string; turn: number };

// Which page the main photo takes: the first photos read on the right in Hebrew; the side turns.
const heroPageOf = (ctx: Ctx) => (ctx.turn % 2 === 0 ? 1 : 0);

// 1. The main photo across the whole spread, the others in one mosaic on its empty page. A subject
// near the middle of its photo moves to its page with the photo enlarged a little (at most 1.25,
// part of it beyond the spread's outer edge).
function heroGrid(ctx: Ctx): Built | null {
  const { g, photos, prefix, gap } = ctx;
  if (photos.length < 2) return null;
  const heroPage = heroPageOf(ctx);
  const gridPage = 1 - heroPage;
  const hp = pageRect(g, heroPage);
  // The faces stay on the hero's page, clear of the fold and of the outer edge.
  const zone = heroPage === 0 ? { x: 0.04 * g.pageW, y: 0, w: g.pageW * 0.9, h: g.H } : { x: hp.x + 0.06 * g.pageW, y: 0, w: g.pageW * 0.9, h: g.H };
  const landscapes = photos.filter((p) => aspectOf(p) >= 1.2);
  // The least enlargement that brings a photo's faces onto the hero's page.
  let best: { p: LayoutPhoto; frame: Rect; focalX: number; focalY: number } | null = null;
  for (const z of [1, 1.12, 1.25]) {
    const w = g.W * z;
    // Enlarged, it grows past the outer edge of the hero's page.
    const frame = { x: heroPage === 0 ? g.W - w : 0, y: 0, w, h: g.H };
    const hero = pickHero(landscapes, frame, zone, HERO_CROP);
    if (!hero) continue;
    best = { p: landscapes[hero.idx], frame, focalX: hero.focalX, focalY: hero.focalY };
    break;
  }
  if (!best) return null;
  const heroPhoto = best.p;
  const rest = photos.filter((p) => p.id !== heroPhoto.id);
  const page = pageRect(g, gridPage);
  const inner = 0.1 * g.pageW;
  const outer = 0.05 * g.pageW;
  const region = { x: gridPage === 1 ? page.x + inner : page.x + outer, y: 0.11 * g.H, w: g.pageW - inner - outer, h: 0.78 * g.H };
  const els: AlbumElement[] = [{ ...photoEl(`${prefix}-hero`, heroPhoto, best.frame, g), focalX: best.focalX, focalY: best.focalY }];
  if (rest.length === 1) {
    const r = fitIn(rest[0], { x: region.x, y: g.H * 0.12, w: region.w, h: g.H * 0.76 });
    els.push(photoEl(`${prefix}-0`, rest[0], r, g, FRAMED));
  } else {
    const rects = block(rest, region, gap, gridPage === 1 ? "end" : "start");
    if (!rects) return null;
    const used = rects.reduce((s, r) => s + r.w * r.h, 0);
    if (used < 0.42 * region.w * region.h) return null;
    // A low strip of photos across the page isn't the reference's mosaic: another type takes them.
    const top = Math.min(...rects.map((r) => r.y));
    const bottom = Math.max(...rects.map((r) => r.y + r.h));
    if (bottom - top < 0.6 * g.H) return null;
    rest.forEach((p, i) => els.push(photoEl(`${prefix}-${i}`, p, rects[i], g, LINE)));
  }
  const th = 0.15 * g.H;
  const title = placeTitle(ctx, els, [
    { x: hp.x + 0.06 * g.pageW, y: 0.04 * g.H, w: g.pageW * 0.88, h: th },
    { x: hp.x + 0.06 * g.pageW, y: 0.8 * g.H, w: g.pageW * 0.88, h: th },
    { x: page.x + 0.06 * g.pageW, y: 0.005 * g.H, w: g.pageW * 0.88, h: 0.1 * g.H },
  ], "#ffffff");
  if (title) els.push(title);
  return { elements: els, bleedIds: [`${prefix}-hero`] };
}

// 2. The main photo fills its page; the other page is filled edge to edge with a mosaic.
function heroPage(ctx: Ctx): Built | null {
  const { g, photos, prefix, gap } = ctx;
  if (photos.length < 3) return null;
  const hpIdx = heroPageOf(ctx);
  const hp = pageRect(g, hpIdx);
  const frame = { x: hp.x + (hpIdx === 1 ? gap / 2 : 0), y: 0, w: g.pageW - gap / 2, h: g.H };
  const zone = { x: frame.x + 0.05 * frame.w, y: 0, w: frame.w * 0.9, h: g.H };
  const hero = pickHero(photos, frame, zone, 1.6);
  if (!hero) return null;
  const heroPhoto = photos[hero.idx];
  const rest = without(photos, hero.idx);
  const op = pageRect(g, 1 - hpIdx);
  const region = { x: op.x + (hpIdx === 0 ? gap / 2 : 0), y: 0, w: g.pageW - gap / 2, h: g.H };
  const rects = fillMosaic(rest, region, gap);
  if (!rects) return null;
  const els: AlbumElement[] = [shapeEl(`${prefix}-page`, { x: 0, y: 0, w: g.W, h: g.H }, g, "#ffffff")];
  els.push({ ...photoEl(`${prefix}-hero`, heroPhoto, frame, g), focalX: hero.focalX, focalY: hero.focalY });
  rest.forEach((p, i) => els.push(photoEl(`${prefix}-${i}`, p, rects[i], g, {}, { x0: 0.04, x1: 0.96 })));
  const title = placeTitle(ctx, els, [
    { x: frame.x + 0.06 * frame.w, y: 0.04 * g.H, w: frame.w * 0.88, h: 0.15 * g.H },
    { x: frame.x + 0.06 * frame.w, y: 0.81 * g.H, w: frame.w * 0.88, h: 0.15 * g.H },
  ], "#ffffff");
  if (title) els.push(title);
  return { elements: els, bleedIds: els.filter((e) => e.type !== "text").map((e) => e.id) };
}

// 3. Two photos side by side fill each page, full height, white gutters.
function pairs(ctx: Ctx): Built | null {
  const { g, photos, prefix, gap } = ctx;
  if (photos.length !== 2 && photos.length !== 4) return null;
  const per = photos.length / 2;
  // Reading order: the first photos on the right page.
  const groups = [photos.slice(per), photos.slice(0, per)];
  const els: AlbumElement[] = [shapeEl(`${prefix}-page`, { x: 0, y: 0, w: g.W, h: g.H }, g, "#ffffff")];
  for (let pg = 0; pg < 2; pg++) {
    const p = pageRect(g, pg);
    const region = { x: p.x + (pg === 1 ? gap / 2 : 0), y: 0, w: g.pageW - gap / 2, h: g.H };
    const grp = groups[pg];
    if (grp.length === 1) {
      if (cropOf(grp[0], region) > 1.6) return null;
      els.push(photoEl(`${prefix}-${pg}`, grp[0], region, g, {}, { x0: 0.05, x1: 0.95 }));
      continue;
    }
    const total = grp.reduce((s, q) => s + aspectOf(q), 0);
    let x = region.x;
    const usable = region.w - gap;
    for (let i = 0; i < grp.length; i++) {
      const w = (usable * aspectOf(grp[i])) / total;
      const r = { x, y: 0, w, h: g.H };
      if (cropOf(grp[i], r) > MAX_CROP) return null;
      els.push(photoEl(`${prefix}-${pg}-${i}`, grp[i], r, g, {}, { x0: 0.05, x1: 0.95 }));
      x += w + gap;
    }
  }
  return { elements: els, bleedIds: els.map((e) => e.id) };
}

// 4. One photo fills its page; on the light page opposite, the others framed (and the title).
function pageFramed(ctx: Ctx): Built | null {
  const { g, photos, prefix } = ctx;
  if (photos.length < 2 || photos.length > 3) return null;
  const hpIdx = heroPageOf(ctx);
  const hp = pageRect(g, hpIdx);
  const zone = { x: hp.x + 0.05 * g.pageW, y: 0, w: g.pageW * 0.9, h: g.H };
  const hero = pickHero(photos, hp, zone, 1.6);
  if (!hero) return null;
  const heroPhoto = photos[hero.idx];
  const rest = without(photos, hero.idx);
  const op = pageRect(g, 1 - hpIdx);
  const top = ctx.title ? 0.22 : 0.09;
  const region = { x: op.x + 0.08 * g.pageW, y: top * g.H, w: g.pageW * 0.84, h: (0.91 - top) * g.H };
  const rects = rest.length === 1 ? [fitIn(rest[0], region)] : block(rest, region, 0.035 * g.pageW, "center");
  if (rects && rects.reduce((s2, r) => s2 + r.w * r.h, 0) < 0.45 * region.w * region.h) return null;
  if (!rects) return null;
  // The light page is a soft, blurred copy of the main photo (a bare white page looked empty).
  const els: AlbumElement[] = [{ ...photoEl(`${prefix}-hero`, heroPhoto, hp, g), focalX: hero.focalX, focalY: hero.focalY }];
  rest.forEach((p, i) => els.push(photoEl(`${prefix}-${i}`, p, rects[i], g, FRAMED)));
  if (ctx.title) els.push(titleEl(`${prefix}-title`, ctx.title, { x: op.x + 0.08 * g.pageW, y: 0.05 * g.H, w: g.pageW * 0.84, h: 0.16 * g.H }, g, "#ffffff", "center", ctx.titleFont));
  return { elements: els, bleedIds: [`${prefix}-hero`], background: { photoId: heroPhoto.id, blur: 70, opacity: 55 } };
}

// 5. The main photo across the spread; a translucent white panel on its empty page holds the others,
// framed (the reference's closing page).
function panel(ctx: Ctx): Built | null {
  const { g, photos, prefix, gap } = ctx;
  if (photos.length < 2 || photos.length > 3) return null;
  const heroPage = heroPageOf(ctx);
  const panelPage = 1 - heroPage;
  const frame = { x: 0, y: 0, w: g.W, h: g.H };
  const hp = pageRect(g, heroPage);
  const zone = { x: hp.x + (heroPage === 1 ? 0.12 : 0.03) * g.pageW, y: 0, w: g.pageW * 0.85, h: g.H };
  const landscapes = photos.filter((p) => aspectOf(p) >= 1.2);
  const hero = pickHero(landscapes, frame, zone, HERO_CROP);
  if (!hero) return null;
  const heroPhoto = landscapes[hero.idx];
  const rest = photos.filter((p) => p.id !== heroPhoto.id);
  const pp = pageRect(g, panelPage);
  const pw = 0.7 * g.pageW;
  const px = panelPage === 0 ? pp.x + 0.18 * g.pageW : pp.x + 0.12 * g.pageW;
  const panelRect = { x: px, y: 0, w: pw, h: g.H };
  const textH = ctx.title ? 0.2 * g.H : 0;
  const inner = { x: px + 0.06 * pw, y: 0.1 * g.H, w: pw * 0.88, h: g.H * 0.8 - textH };
  const rects = rest.length === 1 ? [fitIn(rest[0], inner)] : block(rest, inner, gap * 2, "center");
  if (!rects) return null;
  const els: AlbumElement[] = [
    { ...photoEl(`${prefix}-hero`, heroPhoto, frame, g), focalX: hero.focalX, focalY: hero.focalY },
    shapeEl(`${prefix}-panel`, panelRect, g, "#ffffff", { opacity: 42 }),
  ];
  rest.forEach((p, i) => els.push(photoEl(`${prefix}-${i}`, p, rects[i], g, { ...LINE, borderWidth: 3, shadow: 25 })));
  if (ctx.title) els.push(titleEl(`${prefix}-title`, ctx.title, { x: px, y: g.H * 0.92 - textH, w: pw, h: textH }, g, "#ffffff", "center", ctx.titleFont));
  return { elements: els, bleedIds: [`${prefix}-hero`, `${prefix}-panel`] };
}

// 6. Three photos in rounded hexagons (a honeycomb, thick white outline) opposite a full page photo.
function hexagons(ctx: Ctx): Built | null {
  const { g, photos, prefix } = ctx;
  if (photos.length !== 4) return null;
  const hpIdx = heroPageOf(ctx);
  const hp = pageRect(g, hpIdx);
  const zone = { x: hp.x + 0.05 * g.pageW, y: 0, w: g.pageW * 0.9, h: g.H };
  const hero = pickHero(photos, hp, zone, 1.6);
  if (!hero) return null;
  const heroPhoto = photos[hero.idx];
  const rest = without(photos, hero.idx);
  // shape-hexagon-rounded: a regular hexagon in a square frame, 0.814 of its width and 0.94 of its
  // height. Two on top, one nested below between them.
  const op = pageRect(g, 1 - hpIdx);
  const region = { x: op.x + 0.04 * g.pageW, y: 0.03 * g.H, w: g.pageW * 0.92, h: g.H * 0.94 };
  const gapH = 0.03 * g.pageW;
  // Width: 2 hexagons + gap + the frame's overhang (0.186 s); height: s + 0.75 × 0.94 s + gap.
  const sW = (region.w - gapH) / (2 * 0.814 + 0.186);
  const sH = (region.h - gapH * 0.866) / (1 + 0.705);
  const s = Math.min(sW, sH);
  const hexW = 0.814 * s;
  const totalW = 2 * hexW + gapH + 0.186 * s;
  const totalH = s + 0.705 * s + gapH * 0.866;
  const ox = region.x + (region.w - totalW) / 2;
  const oy = region.y + (region.h - totalH) / 2;
  const cells: Rect[] = [
    { x: ox, y: oy, w: s, h: s },
    { x: ox + hexW + gapH, y: oy, w: s, h: s },
    { x: ox + (hexW + gapH) / 2, y: oy + 0.705 * s + gapH * 0.866, w: s, h: s },
  ];
  if (rest.some((p, i) => cropOf(p, cells[i]) > 1.8)) return null;
  // On a soft, blurred copy of the main photo (the page behind the honeycomb).
  const els: AlbumElement[] = [{ ...photoEl(`${prefix}-hero`, heroPhoto, hp, g), focalX: hero.focalX, focalY: hero.focalY }];
  // Reading order: the first on the right.
  const order = hpIdx === 0 ? [1, 0, 2] : [0, 1, 2];
  rest.forEach((p, i) => els.push(photoEl(`${prefix}-${i}`, p, cells[order[i]], g, HEX, { x0: 0.15, x1: 0.85, y0: 0.08, y1: 0.92 })));
  return { elements: els, bleedIds: [`${prefix}-hero`], background: { photoId: heroPhoto.id, blur: 70, opacity: 55 } };
}

// 7. One photo across the whole spread (faces off the fold); a portrait fills one page on a blurred
// copy of itself.
function panorama(ctx: Ctx): Built | null {
  const { g, photos, prefix } = ctx;
  if (photos.length !== 1) return null;
  const p = photos[0];
  const frame = { x: 0, y: 0, w: g.W, h: g.H };
  if (cropOf(p, frame) <= HERO_CROP) {
    const c = faceCropFocal(aspectOf(p), g.W / g.H, facesOf(p));
    const mid = g.W / 2;
    const clear = !g.double || !facesOf(p).length || facesInside(p, frame, { x: 0, y: 0, w: mid - 0.02 * g.W, h: g.H }, c.focalX, c.focalY) || facesInside(p, frame, { x: mid + 0.02 * g.W, y: 0, w: mid - 0.02 * g.W, h: g.H }, c.focalX, c.focalY);
    if (clear) {
      const els: AlbumElement[] = [photoEl(`${prefix}-hero`, p, frame, g)];
      if (ctx.title) els.push(titleEl(`${prefix}-title`, ctx.title, { x: 0.55 * g.W, y: 0.78 * g.H, w: 0.4 * g.W, h: 0.16 * g.H }, g, "#ffffff", "center", ctx.titleFont));
      return { elements: els, bleedIds: [`${prefix}-hero`] };
    }
  }
  const hp = pageRect(g, heroPageOf(ctx));
  return { elements: [photoEl(`${prefix}-hero`, p, hp, g, {}, { x0: 0.05, x1: 0.95 })], bleedIds: [`${prefix}-hero`], background: { photoId: p.id, blur: 60 } };
}

// 8. Every photo framed (white mat, soft shadow) on a blurred copy of the first one, like the
// reference's light page of framed photos across the whole spread: the page every set of photos fits
// (no faces to keep clear, two landscapes on a single page), so the book never falls back to another
// style's page. A double page keeps each photo on one side of the fold.
function framed(ctx: Ctx): Built | null {
  const { g, photos, prefix, gap } = ctx;
  if (!photos.length) return null;
  const titleH = ctx.title ? 0.14 * g.H : 0;
  const top = 0.1 * g.H + titleH;
  const h = g.H - top - 0.1 * g.H;
  const groups: { photos: LayoutPhoto[]; region: Rect }[] = [];
  if (g.double && photos.length > 1) {
    // The first photos read on the right in Hebrew.
    const right = photos.slice(0, Math.ceil(photos.length / 2));
    const left = photos.slice(right.length);
    const m = 0.09 * g.pageW;
    groups.push({ photos: right, region: { x: g.pageW + m, y: top, w: g.pageW - 2 * m, h } });
    groups.push({ photos: left, region: { x: m, y: top, w: g.pageW - 2 * m, h } });
  } else {
    const m = (g.double ? 0.09 * g.pageW : 0.07 * g.W);
    groups.push({ photos, region: { x: m, y: top, w: g.W - 2 * m, h } });
  }
  const els: AlbumElement[] = [];
  for (const grp of groups) {
    const rects = grp.photos.length === 1 ? [fitIn(grp.photos[0], grp.region)] : block(grp.photos, grp.region, gap * 2.5, "center");
    if (!rects) return null;
    grp.photos.forEach((p, i) => els.push(photoEl(`${prefix}-${p.id.slice(0, 8)}-${i}`, p, rects[i], g, FRAMED)));
  }
  if (ctx.title) els.push(titleEl(`${prefix}-title`, ctx.title, { x: 0.1 * g.W, y: 0.05 * g.H, w: 0.8 * g.W, h: titleH }, g, "#ffffff", "center", ctx.titleFont));
  return { elements: els, bleedIds: [], background: { photoId: photos[0].id, blur: 70, opacity: 55 } };
}

const BUILDERS: Record<CatalogType, (ctx: Ctx) => Built | null> = {
  "hero-grid": heroGrid,
  "hero-page": heroPage,
  pairs,
  "page-framed": pageFramed,
  panel,
  hexagons,
  panorama,
  framed,
};

// How far apart the special spreads come (the reference has one honeycomb, one panel...): a type is
// skipped while it was used within this many spreads before, when another type fits.
const SPACING: Record<CatalogType, number> = { "hero-grid": 0, "hero-page": 1, pairs: 3, "page-framed": 3, panel: 4, hexagons: 7, panorama: 2, framed: 1 };
// The order types are tried in: the main photo across the spread first (most of the reference).
// "framed" last: the page every set of photos fits, when no other type does.
const PREFERENCE: CatalogType[] = ["hero-grid", "hero-page", "pairs", "panel", "page-framed", "hexagons", "panorama", "framed"];
const SPECIALS: CatalogType[] = ["panel", "pairs", "hexagons", "page-framed"];

// A spread of the catalog style, or null when no catalog type fits its photos (the caller falls back
// to the general composer). `type` tells which one was used (tests, the sketches). `recent`: the
// types of the spreads before it, the latest last, so the special ones stay rare and none repeats
// right away (two main-photo-across spreads in a row are fine, their sides alternate).
export function catalogSpread(input: LayoutInput & { title?: string; titleFont?: string; recent?: CatalogType[] }): (LayoutOutput & { type: CatalogType }) | null {
  const seen = new Set<string>();
  const photos = input.photos.filter((p) => (seen.has(p.id) ? false : (seen.add(p.id), true)));
  if (!photos.length) return null;
  const g = geoOf(input.widthCm, input.heightCm);
  const allowed = new Set<CatalogType>([...(CYCLES[photos.length] ?? ["hero-page", "hero-grid"]), "framed"]);
  const recent = input.recent ?? [];
  const turn = input.bookTurn ?? input.spreadIndex;
  const ctx: Ctx = { g, photos, prefix: `auto-cat-${input.spreadIndex}`, gap: Math.max(0.2, 0.0045 * g.W), title: input.title, titleFont: input.titleFont, turn };
  const tooSoon = (t: CatalogType) => {
    const last = recent.lastIndexOf(t);
    if (last < 0) return false;
    const ago = recent.length - last;
    if (t === "hero-grid") return ago === 1 && recent.length >= 2 && recent[recent.length - 2] === "hero-grid";
    return ago <= SPACING[t];
  };
  // Every fourth spread tries the special types first (a panel, two photos a page, a light page with
  // framed photos, the honeycomb), so the book changes rhythm like the reference does.
  const special = input.spreadIndex % 4 === 3;
  const pref = special ? [...SPECIALS, ...PREFERENCE.filter((t) => !SPECIALS.includes(t))] : PREFERENCE;
  const fresh = pref.filter((t) => allowed.has(t) && !tooSoon(t));
  const stale = pref.filter((t) => allowed.has(t) && !fresh.includes(t));
  // "עיצוב מחדש": the n-th design that fits instead of the first.
  const skip = (input.variant ?? 0) % Math.max(1, 2 * (fresh.length + stale.length));
  let fits = 0;
  // The main photo's side turns from spread to spread. When no fresh type fits on this spread's side
  // (its faces sit on the other half, where the grid would cover them), the other side comes before a
  // type that was used just before (four honeycombs in a book is not the reference).
  for (const group of [fresh, stale]) {
    for (const side of [turn, turn + 1]) {
      ctx.turn = side;
      for (const type of group) {
        const built = BUILDERS[type](ctx);
        if (!built) continue;
        const placed = built.elements.filter((e): e is AlbumPhotoElement => e.type === "photo").map((e) => e.photoId);
        if (placed.length !== photos.length || !photos.every((p) => placed.includes(p.id))) continue;
        if (fits++ < skip) continue;
        return { elements: built.elements, bleedIds: built.bleedIds, ...(built.background ? { background: built.background } : {}), type };
      }
    }
  }
  return null;
}

// The catalog cover: the photo in a circle with a translucent white ring, on a blurred copy of
// itself, and the name in a thin white frame beside it (below it on a square or upright cover).
export function catalogCover(input: CoverInput): LayoutOutput | null {
  const p = input.photo;
  if (!p) return null;
  const g = geoOf(input.widthCm, input.heightCm);
  const wide = g.W / g.H >= 1.3;
  const d = wide ? 0.86 * g.H : Math.min(0.7 * g.H, 0.82 * g.W);
  // Hebrew reads from the right: on a wide cover the circle takes the left side, the name the right.
  const cx = wide ? g.W * 0.32 : g.W / 2;
  const cy = wide ? g.H / 2 : 0.08 * g.H + d / 2;
  const circle = { x: cx - d / 2, y: cy - d / 2, w: d, h: d };
  const ringPad = 0.035 * d;
  const ring = { x: circle.x - ringPad, y: circle.y - ringPad, w: d + 2 * ringPad, h: d + 2 * ringPad };
  const els: AlbumElement[] = [
    // A light wash over the blurred background, as bright as the reference's.
    shapeEl("auto-cover-wash", { x: 0, y: 0, w: g.W, h: g.H }, g, "#ffffff", { opacity: 18 }),
    photoEl("auto-cover-photo", p, circle, g, { maskId: "shape-circle" }, { x0: 0.12, x1: 0.88, y0: 0.08, y1: 0.92 }),
    shapeEl("auto-cover-ring", ring, g, "#ffffff", { shapeStyle: "circle-outline", borderWidth: 9, borderColor: "#ffffff", opacity: 55 }),
  ];
  // The name large; after a comma ("יעל ואיתי, חתונה") and the event's kind and date, a smaller line
  // under it, so a long gallery name doesn't shrink the name to fit one line.
  const full = (input.lines?.main ?? input.title ?? "").trim();
  const [name, ...after] = full.split(/\s*,\s*/);
  const title = (name ?? "").trim();
  const sub = [after.join(", "), input.lines?.sub ?? ""].map((v) => v.trim()).filter(Boolean).join(" | ");
  if (title) {
    const box = wide
      ? { x: g.W * 0.6, y: 0.18 * g.H, w: g.W * 0.36, h: 0.64 * g.H }
      : { x: g.W * 0.12, y: cy + d / 2 + 0.04 * g.H, w: g.W * 0.76, h: g.H - (cy + d / 2 + 0.04 * g.H) - 0.05 * g.H };
    els.push(shapeEl("auto-cover-frame", box, g, "#ffffff", { shapeStyle: "rect-outline", borderWidth: 2, borderColor: "#ffffff", opacity: 75 }));
    const nameBox = sub
      ? { x: box.x + box.w * 0.06, y: box.y + box.h * 0.18, w: box.w * 0.88, h: box.h * 0.42 }
      : { x: box.x + box.w * 0.06, y: box.y + box.h * 0.25, w: box.w * 0.88, h: box.h * 0.5 };
    els.push(titleEl("auto-cover-title", title, nameBox, g, "#ffffff"));
    if (sub) els.push(titleEl("auto-cover-subtitle", sub, { x: box.x + box.w * 0.1, y: box.y + box.h * 0.62, w: box.w * 0.8, h: box.h * 0.16 }, g, "#ffffff"));
  }
  return { elements: els, bleedIds: ["auto-cover-wash"], background: { photoId: p.id, blur: 55 } };
}
