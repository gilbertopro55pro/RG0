import type { AlbumFrame, AlbumPhotoElement } from "@/lib/types";
import { faceCropFocal } from "./layouts";
import { collageTemplates, designShape } from "./redesign";
import { assignToFrames, type FrameFinish } from "./templateFill";
import type { LayoutPhoto } from "./types";

// A book's page (בוק בר/בת מצווה, owner 2026-11-01: "העדיפות באלבום בוק לתמונות גדולות ככל הניתן
// ובלי שהדמות תחתך"): the page's photos as large as the page holds, none cut. The frames come from
// the collage layouts made for these very photos (justified rows, columns, a big photo beside the
// rest; a double page laid out half by half, so no photo sits on the fold), plus any extra frame
// sets given (the photographer's own templates for this many photos). A frame that would crop its
// photo past BOOK_FILL_CROP takes the photo's own shape, centred where the frame was: the photo is
// shown whole, never a figure cut to fit. The layout whose photos come out largest wins (their
// total area, and the smallest one), consecutive pages taking different shapes among the near-best.
// Frames are in percent of the page before the safe margin, as the designer's other layouts.

export const BOOK_FILL_CROP = 1.08;

export type BookPage = { frames: AlbumFrame[]; photos: LayoutPhoto[]; shape: string; worstCrop: number };

export function bookPage(
  photos: readonly LayoutPhoto[],
  p: { widthCm: number; heightCm: number; marginCm: number; spreadIndex: number; extra?: AlbumFrame[][]; avoidShape?: string | null }
): BookPage | null {
  if (photos.length === 0) return null;
  const sw = Math.max(1e-6, p.widthCm - 2 * p.marginCm);
  const sh = Math.max(1e-6, p.heightCm - 2 * p.marginCm);
  const list = [...photos];
  const candidates = [...collageTemplates(list, p.widthCm, p.heightCm, p.marginCm), ...(p.extra ?? []).filter((f) => f.length === list.length)];
  const double = p.widthCm / p.heightCm >= 1.6;
  // A page of one photo (a book whose pages outnumber twice its photos): the photo on its own, as
  // large as the page holds; on a double page on one side of the fold, the sides taking turns.
  if (list.length === 1) {
    candidates.length = 0;
    if (!double) candidates.push([{ id: "one", xPct: 3, yPct: 3, widthPct: 94, heightPct: 94 }]);
    else candidates.push([{ id: "one", xPct: p.spreadIndex % 2 === 0 ? 52 : 2, yPct: 3, widthPct: 46, heightPct: 94 }]);
  }
  const scored = candidates.map((frames) => {
    const { pairs } = assignToFrames(frames, list, sw, sh);
    let worst = 1;
    const placed = pairs.map(({ frame, photo }) => {
      const r = whole(frame, photo.aspect, sw, sh);
      worst = Math.max(worst, r.crop);
      return { frame: r.frame, photo };
    });
    const areas = placed.map(({ frame }) => ((frame.widthPct * sw) / 100) * ((frame.heightPct * sh) / 100));
    const total = areas.reduce((a, b) => a + b, 0);
    const score = total + list.length * Math.min(...areas);
    const frs = placed.map((x) => x.frame);
    return { frames: frs, photos: placed.map((x) => x.photo), score, worst, shape: designShape(frs) };
  });
  // Never a photo on a double page's fold (the photographer's own templates may run across it).
  const offFold = double ? scored.filter((c) => c.frames.every((f) => f.xPct + f.widthPct <= 50.01 || f.xPct >= 49.99)) : scored;
  if (offFold.length) scored.splice(0, scored.length, ...offFold);
  if (scored.length === 0) return null;
  scored.sort((a, b) => b.score - a.score);
  const best = scored[0].score;
  // Near-best layouts of different shapes, the one the page before used last.
  const good: typeof scored = [];
  for (const s of scored) if (s.score >= best * 0.95 && !good.some((g) => g.shape === s.shape)) good.push(s);
  const fresh = good.filter((s) => s.shape !== p.avoidShape);
  const pool = fresh.length ? fresh : good;
  const pick = pool[Math.abs(p.spreadIndex) % pool.length];
  return { frames: pick.frames, photos: pick.photos, shape: pick.shape, worstCrop: pick.worst };
}

// The frame as the photo will show in it: kept when it crops the photo no more than BOOK_FILL_CROP,
// else narrowed (or shortened) to the photo's own shape, centred in the frame's place.
function whole(frame: AlbumFrame, aspect: number, sw: number, sh: number): { frame: AlbumFrame; crop: number } {
  const pa = aspect > 0.05 && Number.isFinite(aspect) ? aspect : 1.5;
  const wCm = (frame.widthPct * sw) / 100;
  const hCm = (frame.heightPct * sh) / 100;
  const fa = wCm / Math.max(1e-6, hCm);
  const crop = Math.max(fa / pa, pa / fa);
  if (crop <= BOOK_FILL_CROP) return { frame, crop };
  if (fa > pa) {
    const widthPct = ((hCm * pa) / sw) * 100;
    return { frame: { ...frame, xPct: frame.xPct + (frame.widthPct - widthPct) / 2, widthPct }, crop: 1 };
  }
  const heightPct = ((wCm / pa) / sh) * 100;
  return { frame: { ...frame, yPct: frame.yPct + (frame.heightPct - heightPct) / 2, heightPct }, crop: 1 };
}

// The page's photo elements: each photo in its frame, the crop (what little there is) kept on the
// faces, with the style's finish (outline and shadow).
export function bookElements(page: BookPage, widthCm: number, heightCm: number, marginCm: number, idPrefix: string, finish?: FrameFinish): AlbumPhotoElement[] {
  const sw = Math.max(1e-6, widthCm - 2 * marginCm);
  const sh = Math.max(1e-6, heightCm - 2 * marginCm);
  return page.frames.map((frame, i) => {
    const photo = page.photos[i];
    const crop = faceCropFocal(photo.aspect, (frame.widthPct * sw) / Math.max(1e-6, frame.heightPct * sh), photo.faces ?? []);
    return {
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
      ...(finish ?? {}),
    } as AlbumPhotoElement;
  });
}
