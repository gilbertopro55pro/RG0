import type { AlbumFrame, AlbumPhotoElement } from "@/lib/types";
import { generateTemplateFrames, TEMPLATE_BANK, templateTabFor } from "@/lib/albumTemplateBank";
import { faceCropFocal } from "./layouts";
import type { LayoutPhoto } from "./types";

// Filling photos into frame templates (owner, 2026-09-30) — shared by the auto designer's "saved
// template" mode (a whole album_book_templates book) and the per-page "עיצוב מחדש" button (page
// templates from the library: the photographer's album_templates + the built-in TEMPLATE_BANK).
// Pure and deterministic. Frames are in percent of the spread (as in the editor); aspect ratios are
// computed in real centimetres from the album's size.

const MAX_PER_PAGE = 20;

function frameAspect(f: AlbumFrame, W: number, H: number): number {
  return (f.widthPct * W) / Math.max(1e-6, f.heightPct * H);
}

function safeAspect(a: number): number {
  return a > 0.05 && Number.isFinite(a) ? a : 1.5;
}

// A frame's shape as printed: the album fits every frame into the page's safe margin except the ones
// that bleed off it (fitAutoElements, bleedIdsOf), which squeezes a 60×30 spread's frames 3% more in
// height than in width. The quality check found a photographer's template cropping 1.86 past the
// 1.8 limit below, measured before that fit (2026-10-21).
function printedAspect(f: AlbumFrame, W: number, H: number, marginCm: number): number {
  const bleeds = !f.borderWidth && (f.xPct <= 0.5 || f.yPct <= 0.5 || f.xPct + f.widthPct >= 99.5 || f.yPct + f.heightPct >= 99.5);
  return marginCm > 0 && !bleeds && W > 2 * marginCm && H > 2 * marginCm ? frameAspect(f, W - 2 * marginCm, H - 2 * marginCm) : frameAspect(f, W, H);
}

// Photos to frames: the widest photo into the widest frame, and so on (reading order on ties), which
// minimises cropping and keeps portraits in portrait frames. cost = mean log crop, worst = max crop.
// `marginCm`: the album's safe margin, to measure the crop on the frames as printed (printedAspect).
export function assignToFrames(frames: AlbumFrame[], photos: LayoutPhoto[], W: number, H: number, marginCm = 0) {
  const aspect = (f: AlbumFrame) => printedAspect(f, W, H, marginCm);
  const fOrder = frames.map((_, i) => i).sort((a, b) => aspect(frames[a]) - aspect(frames[b]) || a - b);
  const pOrder = photos.map((_, i) => i).sort((a, b) => safeAspect(photos[a].aspect) - safeAspect(photos[b].aspect) || a - b);
  let cost = 0;
  let worst = 1;
  const pairs = fOrder.map((fi, j) => {
    const frame = frames[fi];
    const photo = photos[pOrder[j]];
    const fa = aspect(frame);
    const pa = safeAspect(photo.aspect);
    const crop = Math.max(fa / pa, pa / fa);
    cost += Math.log(crop);
    worst = Math.max(worst, crop);
    return { frame, photo };
  });
  // Back in the template's own frame order (stable element order / z-order).
  pairs.sort((a, b) => frames.indexOf(a.frame) - frames.indexOf(b.frame));
  return { pairs, cost: frames.length ? cost / frames.length : 0, worst };
}

export type FrameFinish = Partial<Pick<AlbumPhotoElement, "borderWidth" | "borderColor" | "shadow">>;

// Photo elements for a filled template: the frame's geometry (and its own border/shadow/rotation,
// unless `finish` overrides them) with a face-aware crop so no head is cut.
export function frameElements(frames: AlbumFrame[], photos: LayoutPhoto[], W: number, H: number, idPrefix: string, finish?: FrameFinish): AlbumPhotoElement[] {
  const { pairs } = assignToFrames(frames, photos, W, H);
  return pairs.map(({ frame, photo }, i) => {
    const crop = faceCropFocal(safeAspect(photo.aspect), frameAspect(frame, W, H), photo.faces ?? []);
    const el: AlbumPhotoElement = {
      id: `${idPrefix}-${i}`,
      type: "photo",
      photoId: photo.id,
      xPct: frame.xPct,
      yPct: frame.yPct,
      widthPct: frame.widthPct,
      heightPct: frame.heightPct,
      focalX: crop.focalX,
      focalY: crop.focalY,
      zoom: 100,
      ...(frame.rotation ? { rotation: frame.rotation } : {}),
      ...(frame.borderWidth ? { borderWidth: frame.borderWidth, borderColor: frame.borderColor ?? "#ffffff" } : {}),
      ...(frame.shadow ? { shadow: frame.shadow } : {}),
      ...(frame.shadowAngle !== undefined ? { shadowAngle: frame.shadowAngle } : {}),
    };
    if (finish) {
      delete el.borderWidth;
      delete el.borderColor;
      delete el.shadow;
      Object.assign(el, finish);
    }
    return el;
  });
}

// The library's templates for exactly n photos: the photographer's own first, then the built-in tab
// (for the "10+" tab only those with exactly n frames), topped up with generated ones.
export function templatesForCount(n: number, userTemplates: AlbumFrame[][] = []): AlbumFrame[][] {
  const own = userTemplates.filter((f) => f.length === n);
  const bank = (TEMPLATE_BANK[templateTabFor(n)] ?? []).map((t) => t.frames).filter((f) => f.length === n);
  const out = [...own, ...bank];
  for (let seed = 1; out.length < 24; seed++) out.push(generateTemplateFrames(n, 7919 * n + seed));
  return out;
}

// Candidates ordered by how well these photos fit them (least cropping first).
export function rankTemplates(cands: AlbumFrame[][], photos: LayoutPhoto[], W: number, H: number): AlbumFrame[][] {
  return cands
    .map((frames, i) => ({ frames, i, ...assignToFrames(frames, photos, W, H) }))
    .filter((c) => c.frames.length === photos.length)
    .sort((a, b) => a.worst - b.worst > 0.15 || b.worst - a.worst > 0.15 ? a.worst - b.worst : a.cost - b.cost || a.i - b.i)
    .map((c) => c.frames);
}

// The best template for these photos out of the library.
export function bestTemplateFor(photos: LayoutPhoto[], W: number, H: number, userTemplates: AlbumFrame[][] = []): AlbumFrame[] {
  return rankTemplates(templatesForCount(photos.length, userTemplates), photos, W, H)[0] ?? generateTemplateFrames(photos.length, 1);
}

// Photos that run to the page edge on purpose (no frame, touching an edge) — the UI must not pull
// these into the print safe margin (LayoutOutput.bleedIds semantics).
export function bleedIdsOf(elements: AlbumPhotoElement[]): string[] {
  return elements
    .filter((e) => !e.borderWidth && (e.xPct <= 0.5 || e.yPct <= 0.5 || e.xPct + e.widthPct >= 99.5 || e.yPct + e.heightPct >= 99.5))
    .map((e) => e.id);
}

// A saved book template's first page with a single frame is its cover (the album wizard saves the
// cover as page 0); when the auto designer makes its own cover, that page is left out.
export function bookPagesWithoutCover(pages: AlbumFrame[][]): AlbumFrame[][] {
  const used = pages.filter((p) => p.length > 0);
  return used.length > 1 && used[0].length === 1 ? used.slice(1) : used;
}

/**
 * A whole book from a saved book template (album_book_templates.pages), photos in `ordered` order.
 * Owner's rules (2026-09-30):
 *  - pages are filled in the template's order, each with as many photos as it has frames;
 *  - more room than photos → the trailing pages are dropped (never an empty page);
 *  - the LAST page, when fewer photos are left than it has frames, is redesigned for the photos that
 *    are left (a library template for that count) — only that page, never the others;
 *  - never a single-photo page (a lone leftover joins the page before it, which is then redesigned);
 *  - fewer frames than photos → the template's pages repeat from the start, up to `maxSpreads`
 *    pages; past that the last pages take the extra photos (redesigned for their new count, up to
 *    20 each) — a photo is never dropped.
 */
export function fillBookTemplate(
  pages: AlbumFrame[][],
  ordered: LayoutPhoto[],
  opts: { maxSpreads: number; widthCm: number; heightCm: number; userTemplates?: AlbumFrame[][] }
): AlbumPhotoElement[][] {
  const W = opts.widthCm > 0 ? opts.widthCm : 60;
  const H = opts.heightCm > 0 ? opts.heightCm : 30;
  const tpl = pages.filter((p) => p.length > 0);
  const P = ordered.length;
  if (!P) return [];
  const maxSpreads = Math.max(1, opts.maxSpreads);
  // Page plan: which template page (or null = redesigned) and how many photos.
  const plan: { frames: AlbumFrame[] | null; count: number }[] = [];
  let placed = 0;
  // A repeat of the template starts after a leading single-frame (cover-like) page.
  const again = tpl.length > 1 && tpl[0].length === 1 ? tpl.slice(1) : tpl;
  for (let i = 0; placed < P && plan.length < maxSpreads; i++) {
    const frames = !tpl.length ? null : i < tpl.length ? tpl[i] : again[(i - tpl.length) % again.length];
    const room = frames ? frames.length : Math.min(6, P - placed);
    const count = Math.min(room, P - placed);
    plan.push({ frames: count === room ? frames : null, count });
    placed += count;
  }
  // Out of pages: the last pages take the rest, round robin from the end.
  for (let left = P - placed, i = plan.length - 1; left > 0; ) {
    if (plan.every((p) => p.count >= MAX_PER_PAGE)) {
      plan[plan.length - 1].count += left; // (only past 20×maxSpreads photos)
      plan[plan.length - 1].frames = null;
      break;
    }
    if (plan[i].count < MAX_PER_PAGE) {
      plan[i].count++;
      plan[i].frames = null;
      left--;
    }
    i = i === 0 ? plan.length - 1 : i - 1;
  }
  // Never a single-photo page: a lone last photo joins the page before it.
  if (plan.length > 1 && plan[plan.length - 1].count === 1) {
    plan.pop();
    plan[plan.length - 1].count++;
    plan[plan.length - 1].frames = null;
  }
  const out: AlbumPhotoElement[][] = [];
  let pos = 0;
  plan.forEach((pg, i) => {
    const photos = ordered.slice(pos, pos + pg.count);
    pos += pg.count;
    const frames = pg.frames ?? bestTemplateFor(photos, W, H, opts.userTemplates);
    // A redesigned page keeps the look (frame finish) of the template's own frames.
    const src = (i < tpl.length ? tpl[i] : again[(i - tpl.length) % Math.max(1, again.length)])?.find((f) => f.borderWidth || f.shadow);
    const finish: FrameFinish | undefined =
      pg.frames || !src ? undefined : { ...(src.borderWidth ? { borderWidth: src.borderWidth, borderColor: src.borderColor ?? "#ffffff" } : {}), ...(src.shadow ? { shadow: src.shadow } : {}) };
    out.push(frameElements(frames, photos, W, H, `tpl-${i}`, finish));
  });
  return out;
}

// How much a photographer's own template may crop a photo before the page falls back to the engine.
const OWN_TEMPLATE_MAX_CROP = 1.8;

/**
 * The automatic design's own-template share (owner, 2026-10-06: "mostly my templates — 70% mine,
 * 30% the system's"). For each page, in order: the photographer's own page template (album_templates)
 * for exactly that page's photo count, or null for the style's own layout. A page takes an own
 * template while the share so far is under `share` and one fits (least cropping first, the one used
 * least so far and never the previous page's), so own pages spread evenly through the book. A count
 * with no own template stays with the style's layout and the next pages catch up.
 */
export function ownTemplatePlan(
  pages: LayoutPhoto[][],
  own: AlbumFrame[][],
  W: number,
  H: number,
  { share = 0.7, marginCm = 0 }: { share?: number; marginCm?: number } = {}
): (AlbumFrame[] | null)[] {
  const uses = new Map<AlbumFrame[], number>();
  let used = 0;
  let prev: AlbumFrame[] | null = null;
  return pages.map((photos, i) => {
    let pick: AlbumFrame[] | null = null;
    if (photos.length > 1 && used < Math.round(share * (i + 1))) {
      const fits = own
        .filter((f) => f.length === photos.length && f !== prev)
        .map((frames) => ({ frames, ...assignToFrames(frames, photos, W, H, marginCm) }))
        .filter((c) => c.worst <= OWN_TEMPLATE_MAX_CROP)
        .sort((a, b) => (uses.get(a.frames) ?? 0) - (uses.get(b.frames) ?? 0) || a.cost - b.cost);
      pick = fits[0]?.frames ?? null;
    }
    if (pick) {
      used++;
      uses.set(pick, (uses.get(pick) ?? 0) + 1);
    }
    prev = pick;
    return pick;
  });
}

// The owner's corrections to an auto album built mostly from their own templates ("עלייה לתורה -
// אורי", 2026-10-21; their own layouts were mostly kept, 9 of the 12 template pages were edited).
// Two that hold on every page and touch none they kept, applied to a template before it's filled:
// - the frames beside the tall ones (under 85% of the height) are one block, centred top to bottom:
//   page 12 sat 3% from the top and 17% from the bottom, the owner moved it 7.2% down. Not when
//   another frame isn't full height (a wide photo across the top holds the block where it is) or
//   the move would put a frame over one it was clear of;
// - an edge of the block's outline that misses it by 0.3–1.6% lines up with it, outwards, when
//   nothing lies beyond it and nothing would overlap: a left edge at 3.0 under one at 1.5 (page 12),
//   a bottom at 93.4 beside 94.2 (page 20). A wider miss is left alone, as a deliberate inset.
const TALL_FRAME = 85;
const CENTER_FROM = 1.5;
const SNAP_MIN = 0.3;
const SNAP_MAX = 1.6;

type Side = "left" | "right" | "top" | "bottom";
const SIDES: Side[] = ["left", "right", "top", "bottom"];

function edgeOf(f: AlbumFrame, side: Side): number {
  if (side === "left") return f.xPct;
  if (side === "right") return f.xPct + f.widthPct;
  if (side === "top") return f.yPct;
  return f.yPct + f.heightPct;
}

// The frame with one side moved to `at`, the opposite side where it was.
function withEdge(f: AlbumFrame, side: Side, at: number): AlbumFrame {
  if (side === "left") return { ...f, xPct: at, widthPct: f.xPct + f.widthPct - at };
  if (side === "right") return { ...f, widthPct: at - f.xPct };
  if (side === "top") return { ...f, yPct: at, heightPct: f.yPct + f.heightPct - at };
  return { ...f, heightPct: at - f.yPct };
}

const EPS = 0.05;

function overlaps(a: AlbumFrame, b: AlbumFrame): boolean {
  return a.xPct < b.xPct + b.widthPct - EPS && b.xPct < a.xPct + a.widthPct - EPS && a.yPct < b.yPct + b.heightPct - EPS && b.yPct < a.yPct + a.heightPct - EPS;
}

// Another frame past this side of `f`, across from it (beside it on the other axis).
function somethingBeyond(f: AlbumFrame, side: Side, others: AlbumFrame[]): boolean {
  const horizontal = side === "left" || side === "right";
  return others.some((o) => {
    const across = horizontal
      ? o.yPct < f.yPct + f.heightPct - EPS && f.yPct < o.yPct + o.heightPct - EPS
      : o.xPct < f.xPct + f.widthPct - EPS && f.xPct < o.xPct + o.widthPct - EPS;
    if (!across) return false;
    if (side === "left") return o.xPct < f.xPct - EPS;
    if (side === "right") return o.xPct + o.widthPct > f.xPct + f.widthPct + EPS;
    if (side === "top") return o.yPct < f.yPct - EPS;
    return o.yPct + o.heightPct > f.yPct + f.heightPct + EPS;
  });
}

export function tidyOwnFrames(frames: AlbumFrame[]): AlbumFrame[] {
  const out = frames.map((f) => ({ ...f }));
  const inBlock = (f: AlbumFrame) => !f.rotation && f.heightPct < TALL_FRAME && f.widthPct < TALL_FRAME;
  const block = out.map((f, i) => (inBlock(f) ? i : -1)).filter((i) => i >= 0);
  if (block.length === 0) return out;

  const top = Math.min(...block.map((i) => out[i].yPct));
  const bottom = Math.max(...block.map((i) => out[i].yPct + out[i].heightPct));
  const shift = (100 - bottom - top) / 2;
  const outside = out.filter((_, j) => !block.includes(j));
  if (Math.abs(shift) > CENTER_FROM && outside.every((o) => o.heightPct >= TALL_FRAME)) {
    const shifted = block.map((i) => ({ ...out[i], yPct: out[i].yPct + shift }));
    if (!shifted.some((f, k) => outside.some((o) => overlaps(f, o) && !overlaps(out[block[k]], o)))) block.forEach((i, k) => (out[i] = shifted[k]));
  }

  const outward = (side: Side, from: number, to: number) => (side === "left" || side === "top" ? from - to : to - from);
  for (const i of block) {
    for (const side of SIDES) {
      const f = out[i];
      const others = out.filter((_, j) => j !== i);
      if (somethingBeyond(f, side, others)) continue;
      const here = edgeOf(f, side);
      // The block's outline on this side.
      const edges = block.map((j) => edgeOf(out[j], side));
      const at = side === "left" || side === "top" ? Math.min(...edges) : Math.max(...edges);
      const miss = outward(side, here, at);
      if (miss < SNAP_MIN || miss > SNAP_MAX) continue;
      const moved = withEdge(f, side, at);
      if (!others.some((o) => overlaps(moved, o))) out[i] = moved;
    }
  }
  return out;
}

// A main photo of a template — full height, run off the left or the right edge — whose inner edge
// ends just at the frames beside it (they start at most 2% over it, or past it) gets the clean style's
// fade toward them (owner, 2026-10-21: pages 2 and 5, at 1.3% and 2.0%). One that the frames sit well
// over (5.6–7.9% on pages 11, 14 and 17, and 2.3% on a page the owner kept) stays as it is.
const FADE_UPTO = 2.1;

export function fadeOwnHeroes(elements: AlbumPhotoElement[]): AlbumPhotoElement[] {
  const isHero = (e: AlbumPhotoElement) =>
    !e.borderWidth && !e.rotation && !e.maskId && e.heightPct >= 99 && e.widthPct < 90 && (e.xPct <= 0.5) !== (e.xPct + e.widthPct >= 99.5);
  const rest = elements.filter((e) => !(e.heightPct >= 99 && (e.xPct <= 0.5 || e.xPct + e.widthPct >= 99.5)));
  return elements.map((e) => {
    if (!isHero(e)) return e;
    const left = e.xPct <= 0.5;
    const inner = left ? e.xPct + e.widthPct : e.xPct;
    const past = rest.filter((g) => (left ? g.xPct + g.widthPct > inner + 0.5 : g.xPct < inner - 0.5));
    if (past.length === 0) return e;
    const over = left ? inner - Math.min(...past.map((g) => g.xPct)) : Math.max(...past.map((g) => g.xPct + g.widthPct)) - inner;
    return over <= FADE_UPTO ? { ...e, maskId: left ? "fade-right-25" : "fade-left-25" } : e;
  });
}
