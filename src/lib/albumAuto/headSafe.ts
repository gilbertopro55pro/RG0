import type { AlbumElement, AlbumPhotoElement } from "@/lib/types";
import { marginInsetPctFor } from "@/lib/albumSafeArea";
import { fitPhotoInFrame, type FaceRect } from "./swapPhotos";
import { coveredAbove, facesFindings, mainFaces } from "./qualityCheck";

// The auto designer's last pass (owner, 2026-10-27: "שהדמויות בתמונה לא חתוכות … ואם אחרי המרכוז
// הראש נחתך בגלל המסגרת, לכוון שהתמונה תופיע בלי שהדמויות נחתכות"): every photo whose head comes out
// cut, or whose face sits in the trimmed margin, has its crop moved by the faces (fitPhotoInFrame,
// the frame never moves) — exactly the quality check's safe fix: kept only when checking the moved
// crop shows the problem gone and nothing else worse (a face pushed onto the fold, a head cut at
// the other end). The check runs on the frames as the album saves them: the parent pulls every frame
// but the bleeding ones into the safe margin (fitAutoElements in galleryManage/helpers.ts), which
// changes their shape a little; a crop only moves the focal point, which that fit leaves alone.
//
// Left as laid out: masked frames (the faded heroes, whose crop keeps the faces clear of the fade),
// rotated or locked frames, and frames with anything drawn over them — another photo (a grid sitting
// on a hero, placed clear of its faces), text, an ornament or a filled shape (the cover's band and
// title) — since moving the crop would slide the faces under it.

export type HeadSafePage = {
  elements: AlbumElement[];
  // Elements that run to the page edge on purpose (not pulled into the safe margin).
  bleedIds: string[];
  widthCm: number;
  heightCm: number;
};

export type HeadSafeOptions = {
  safeMarginCm: number;
  // A double page (the fold at 50%).
  fold: boolean;
  aspectOf: (photoId: string) => number | null;
  facesOf: (photoId: string) => FaceRect[] | undefined;
};

const RANK = { warning: 1, error: 2 } as const;

type Box = { xPct: number; yPct: number; widthPct: number; heightPct: number };

const overlaps = (a: Box, b: Box) =>
  Math.min(a.xPct + a.widthPct, b.xPct + b.widthPct) > Math.max(a.xPct, b.xPct) && Math.min(a.yPct + a.heightPct, b.yPct + b.heightPct) > Math.max(a.yPct, b.yPct);

// The page's elements with the cut heads fixed where moving the crop fixes them (the same array when
// nothing changes).
export function headSafeElements(page: HeadSafePage, opts: HeadSafeOptions): AlbumElement[] {
  const size = { widthCm: page.widthCm, heightCm: page.heightCm };
  const inset = marginInsetPctFor({ width_cm: page.widthCm, height_cm: page.heightCm, safe_margin_cm: opts.safeMarginCm });
  const bleed = new Set(page.bleedIds);
  // The frame as saved (fitAutoElements).
  const printed = (el: AlbumPhotoElement): AlbumPhotoElement => {
    if (!inset || bleed.has(el.id)) return el;
    const safeW = 100 - 2 * inset.x;
    const safeH = 100 - 2 * inset.y;
    if (safeW <= 0 || safeH <= 0) return el;
    return { ...el, xPct: inset.x + (el.xPct / 100) * safeW, yPct: inset.y + (el.yPct / 100) * safeH, widthPct: (el.widthPct / 100) * safeW, heightPct: (el.heightPct / 100) * safeH };
  };
  const margin = { x: (opts.safeMarginCm / page.widthCm) * 100, y: (opts.safeMarginCm / page.heightCm) * 100 };
  const checkOpts = { margin, fold: opts.fold };

  let changed = false;
  const out = page.elements.map((el, i) => {
    if (el.type !== "photo" || !el.photoId || el.maskId || el.rotation || el.locked || !(el.widthPct > 0 && el.heightPct > 0)) return el;
    if (coveredAbove(el, page.elements) || page.elements.slice(i + 1).some((o) => o.type === "photo" && overlaps(el, o))) return el;
    const aspect = opts.aspectOf(el.photoId);
    const faces = opts.facesOf(el.photoId);
    if (!aspect || aspect <= 0 || !faces?.length) return el;

    const frame = printed(el);
    const before = facesFindings(frame, size, aspect, faces, checkOpts);
    const targets = before.filter((f) => f.kind === "head-cut" || f.kind === "face-in-margin");
    if (!targets.length) return el;
    const fitted = fitPhotoInFrame(frame, size, aspect, mainFaces(faces), false);
    const patch = { focalX: fitted.focalX, focalY: fitted.focalY, zoom: fitted.zoom };
    const after = facesFindings({ ...frame, ...patch }, size, aspect, faces, checkOpts);
    const rankBefore = new Map(before.map((f) => [f.kind, RANK[f.severity]]));
    const nothingWorse = after.every((a) => RANK[a.severity] <= (rankBefore.get(a.kind) ?? 0));
    const solved = targets.some((tg) => !after.some((a) => a.kind === tg.kind));
    if (!nothingWorse || !solved) return el;
    changed = true;
    return { ...el, ...patch };
  });
  return changed ? out : page.elements;
}
