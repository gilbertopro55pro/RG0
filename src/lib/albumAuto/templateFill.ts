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

// Photos to frames: the widest photo into the widest frame, and so on (reading order on ties), which
// minimises cropping and keeps portraits in portrait frames. cost = mean log crop, worst = max crop.
export function assignToFrames(frames: AlbumFrame[], photos: LayoutPhoto[], W: number, H: number) {
  const fOrder = frames.map((_, i) => i).sort((a, b) => frameAspect(frames[a], W, H) - frameAspect(frames[b], W, H) || a - b);
  const pOrder = photos.map((_, i) => i).sort((a, b) => safeAspect(photos[a].aspect) - safeAspect(photos[b].aspect) || a - b);
  let cost = 0;
  let worst = 1;
  const pairs = fOrder.map((fi, j) => {
    const frame = frames[fi];
    const photo = photos[pOrder[j]];
    const fa = frameAspect(frame, W, H);
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
export function ownTemplatePlan(pages: LayoutPhoto[][], own: AlbumFrame[][], W: number, H: number, share = 0.7): (AlbumFrame[] | null)[] {
  const uses = new Map<AlbumFrame[], number>();
  let used = 0;
  let prev: AlbumFrame[] | null = null;
  return pages.map((photos, i) => {
    let pick: AlbumFrame[] | null = null;
    if (photos.length > 1 && used < Math.round(share * (i + 1))) {
      const fits = own
        .filter((f) => f.length === photos.length && f !== prev)
        .map((frames) => ({ frames, ...assignToFrames(frames, photos, W, H) }))
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
