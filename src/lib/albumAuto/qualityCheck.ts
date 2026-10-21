import type { AlbumElement, AlbumPhotoElement, AlbumTextElement } from "@/lib/types";
import { computePhotoFraming } from "@/lib/albumRender";
import { fitPhotoInFrame, type FaceRect } from "@/lib/albumAuto/swapPhotos";

// The album's quality check (admin, 2026-10-21): a list of what would come out wrong in print,
// page by page, each with a jump to its page and, where it's safe, a one-tap fix. Everything here
// is pure geometry over the saved elements, so the list is recomputed on every change to the
// album (a fix, a swap, an editor save) and the tests need nothing outside this file.
//
// Coordinates: an element's box is in % of its page (the spread for a double page); a face is a
// box in fractions of its image (FaceRect, lib/faceRecognition.ts). What part of the image shows
// in a frame is computePhotoFraming's math (cover-fit, then the zoom grown from the focal point),
// the same one the editor, the thumbnails, the PDF and the JPG/PSD exports use, so a "cut" here is
// a cut on paper too.

export type QualityIssueKind =
  | "empty-frame"
  | "head-cut"
  | "face-in-margin"
  | "face-on-fold"
  | "heavy-crop"
  | "duplicate"
  | "text-outside-margin"
  | "small-file";

export type QualitySeverity = "error" | "warning";

export type QualityFix = { elementId: string; patch: Partial<AlbumPhotoElement> };

export type QualityIssue = {
  id: string;
  kind: QualityIssueKind;
  severity: QualitySeverity;
  spreadId: string;
  // Position in the album (0 = the first page shown), the thumbnail's number minus one.
  pageIndex: number;
  elementId?: string;
  photoId?: string;
  // Numbers for the message, which the screen builds in the viewer's language from kind + params.
  params: Record<string, number>;
  fix?: QualityFix;
};

export type QualitySpread = {
  id: string;
  elements: AlbumElement[] | null;
  // A page with its own size (the cover, e.g. 32×32 in a 60×30 album); null = the album's size.
  width_cm: number | null;
  height_cm: number | null;
  background_photo_id?: string | null;
};

export type QualityPhoto = { aspect: number | null; fileSizeBytes: number | null };

export type QualityInput = {
  album: { width_cm: number; height_cm: number; safe_margin_cm?: number | null };
  // In page order.
  spreads: QualitySpread[];
  // Every photo of the gallery: a frame whose photo isn't here shows nothing (deleted photo).
  photos: ReadonlyMap<string, QualityPhoto>;
  // The photo's faces, or undefined while they aren't known yet: the face checks skip that photo
  // until they are, and the geometry checks show at once.
  faces: (photoId: string) => FaceRect[] | undefined;
};

// ── Thresholds ───────────────────────────────────────────────────────────────────────────────

// A head is cut (error) once a quarter of its face box is outside what shows.
export const HEAD_CUT_ERROR_SHARE = 0.25;
// Less than that, still worth a look (warning): an edge of the face (an ear, the chin) …
export const HEAD_EDGE_WARNING_SHARE = 0.08;
// … or the top of the head: the hair above the face box, 0.35 of its height — the same margin
// fitPhotoInFrame keeps above the highest head — with more than this share of it cut off.
export const HAIR_MARGIN = 0.35;
export const HAIR_CUT_WARNING_SHARE = 0.3;
// The faces a photo is about: at least half the height of its biggest face. Small faces in the
// background are cut by almost any crop of a crowd, and that's not a mistake.
export const MAIN_FACE_SHARE = 0.5;
// A face is in the safe margin (trimmed or too close to the trim) when this share of its box is in
// the band. A sliver of a cheek near the edge isn't worth a warning.
export const MARGIN_FACE_SHARE = 0.1;
// A face on the fold of a double page: measured on paper, not in the image, because what the eye
// sees disappear into the binding is the printed face (a face that's 0.4% of a full-bleed photo is
// a big face; the same face in a small grid cell is a dot). From 1.5 cm high, with the fold
// passing through it and at least 15% of the face on each side (an ear touching the fold isn't
// a face on the fold).
export const FOLD_FACE_MIN_CM = 1.5;
export const FOLD_SIDE_SHARE = 0.15;
// Crop of a photo in its frame (CLAUDE.md: in a grid cell up to ~1.35).
export const HEAVY_CROP_WARNING = 1.35;
export const HEAVY_CROP_ERROR = 1.8;
// A proxy for "not sharp in print": the pixel size of a photo isn't stored, its file size is. An
// original under 600 KB in a frame 15 cm or more on its long side is very likely a small or heavily
// compressed copy (a camera JPEG of a few MB is fine at any album size).
export const SMALL_FILE_BYTES = 600 * 1024;
export const SMALL_FILE_MIN_SIDE_CM = 15;
// The printed width of text is estimated, not measured (no fonts here): the average advance of
// a bold Hebrew/Latin letter is ~0.55em, and 0.6 errs toward warning about a line near the edge.
export const TEXT_GLYPH_EM = 0.6;
// The same edge rule the admin's swap uses for "this frame runs off the page" (fitForSwap in
// GalleryManageView): such a frame keeps its shape.
const BLEED_EDGE_PCT = 0.5;
// The safe margin when the album row has none (marginInsetPctFor's default).
const DEFAULT_SAFE_MARGIN_CM = 0.5;

const KIND_ORDER: QualityIssueKind[] = ["empty-frame", "head-cut", "heavy-crop", "face-on-fold", "face-in-margin", "duplicate", "text-outside-margin", "small-file"];

// ── Geometry ─────────────────────────────────────────────────────────────────────────────────

type Box = { x0: number; y0: number; x1: number; y1: number };
type PageSize = { widthCm: number; heightCm: number };

const area = (b: Box) => Math.max(0, b.x1 - b.x0) * Math.max(0, b.y1 - b.y0);
const intersect = (a: Box, b: Box): Box => ({ x0: Math.max(a.x0, b.x0), y0: Math.max(a.y0, b.y0), x1: Math.min(a.x1, b.x1), y1: Math.min(a.y1, b.y1) });
const faceBox = (f: FaceRect): Box => intersect({ x0: f.x, y0: f.y, x1: f.x + f.width, y1: f.y + f.height }, { x0: 0, y0: 0, x1: 1, y1: 1 });

export function pageSizeOf(spread: QualitySpread, album: QualityInput["album"]): PageSize {
  return spread.width_cm && spread.height_cm ? { widthCm: spread.width_cm, heightCm: spread.height_cm } : { widthCm: album.width_cm, heightCm: album.height_cm };
}

// A page with its own size (the cover) is a single page; an album page is a double spread with the
// fold at 50% from width/height 1.6 (singlePageOf in AlbumAutoDesigner).
export function isDoublePage(spread: QualitySpread, album: QualityInput["album"]): boolean {
  if (spread.width_cm && spread.height_cm) return false;
  return album.height_cm > 0 && album.width_cm / album.height_cm >= 1.6;
}

// The safe-margin band, in % of the page (marginInsetPctFor in AlbumSpreadCanvasEditor).
function marginPct(page: PageSize, album: QualityInput["album"]) {
  const cm = album.safe_margin_cm ?? DEFAULT_SAFE_MARGIN_CM;
  return { x: (cm / page.widthCm) * 100, y: (cm / page.heightCm) * 100 };
}

export function bleedsOffPage(el: { xPct: number; yPct: number; widthPct: number; heightPct: number }): boolean {
  return el.xPct <= BLEED_EDGE_PCT || el.yPct <= BLEED_EDGE_PCT || el.xPct + el.widthPct >= 100 - BLEED_EDGE_PCT || el.yPct + el.heightPct >= 100 - BLEED_EDGE_PCT;
}

// A frame with text, an ornament or a filled shape drawn over it (later in the list = above) is
// part of a composition, like the cover's white band and title over its photo: giving it another
// shape would leave the band hanging off the photo. A shape behind the photos (the clean line's
// translucent panel, "צורה מאחורי התמונות") or an outline around a grid doesn't hold it.
export function coveredAbove(el: AlbumElement, elements: AlbumElement[]): boolean {
  const i = elements.indexOf(el);
  const a = elementBox(el);
  const box: Box = { x0: a.xPct, y0: a.yPct, x1: a.xPct + a.widthPct, y1: a.yPct + a.heightPct };
  return elements.slice(i + 1).some((o) => {
    if (o.type === "photo" || (o.type === "shape" && (o.shapeStyle === "rect-outline" || o.shapeStyle === "circle-outline"))) return false;
    const b = elementBox(o);
    return area(intersect(box, { x0: b.xPct, y0: b.yPct, x1: b.xPct + b.widthPct, y1: b.yPct + b.heightPct })) > 0;
  });
}

// The element's box in % of its page; a text box without a height is drawn 15% high everywhere.
export function elementBox(el: AlbumElement): { xPct: number; yPct: number; widthPct: number; heightPct: number } {
  return { xPct: el.xPct, yPct: el.yPct, widthPct: el.widthPct, heightPct: el.type === "text" ? (el.heightPct ?? 15) : el.heightPct };
}

// How much the photo is cropped in its frame: the share of it that's cut away by the shape
// (cover-fit), times the zoom on top of that. 1 = all of the photo shows.
export function cropOf(el: AlbumPhotoElement, page: PageSize, imgAspect: number): number {
  const frameAspect = (el.widthPct * page.widthCm) / (el.heightPct * page.heightCm) || 1;
  const shape = imgAspect >= frameAspect ? imgAspect / frameAspect : frameAspect / imgAspect;
  const zoom = el.zoom && el.zoom > 100 ? el.zoom / 100 : 1;
  return shape * zoom;
}

// What part of the photo shows (fractions of the image) and where an image point lands on the
// page (% of the page). The window is computePhotoFraming's rendered box read backwards, then cut
// by the page's edges for a frame that runs off the page (the page clips it, on screen and in
// print). A rotated frame shows the same part of the photo — the rotation turns the whole frame —
// so its window isn't cut by the page (tilted frames sit inside it), and its page mapping is
// left unrotated (the checks that need page positions skip rotated frames).
export function photoWindow(el: AlbumPhotoElement, page: PageSize, imgAspect: number) {
  const frameAspect = (el.widthPct * page.widthCm) / (el.heightPct * page.heightCm) || 1;
  const f = computePhotoFraming(imgAspect, frameAspect, el.zoom ?? 100, el.focalX, el.focalY);
  // Image (u, v) → frame fraction → page %.
  const toFrame = (u: number, v: number) => ({ fx: (f.leftPct + u * f.widthPct) / 100, fy: (f.topPct + v * f.heightPct) / 100 });
  const fromFrame = (fx: number, fy: number) => ({ u: (fx * 100 - f.leftPct) / f.widthPct, v: (fy * 100 - f.topPct) / f.heightPct });
  let fx0 = 0;
  let fy0 = 0;
  let fx1 = 1;
  let fy1 = 1;
  if (!el.rotation) {
    fx0 = Math.max(0, -el.xPct / el.widthPct);
    fx1 = Math.min(1, (100 - el.xPct) / el.widthPct);
    fy0 = Math.max(0, -el.yPct / el.heightPct);
    fy1 = Math.min(1, (100 - el.yPct) / el.heightPct);
  }
  const a = fromFrame(fx0, fy0);
  const b = fromFrame(fx1, fy1);
  const window: Box = { x0: Math.max(0, a.u), y0: Math.max(0, a.v), x1: Math.min(1, b.u), y1: Math.min(1, b.v) };
  const toPage = (box: Box): Box => {
    const p = toFrame(box.x0, box.y0);
    const q = toFrame(box.x1, box.y1);
    return { x0: el.xPct + p.fx * el.widthPct, y0: el.yPct + p.fy * el.heightPct, x1: el.xPct + q.fx * el.widthPct, y1: el.yPct + q.fy * el.heightPct };
  };
  return { window, toPage };
}

// The faces a photo is about (see MAIN_FACE_SHARE).
export function mainFaces(faces: FaceRect[]): FaceRect[] {
  const tallest = Math.max(0, ...faces.map((f) => f.height));
  return faces.filter((f) => f.height >= tallest * MAIN_FACE_SHARE);
}

type FaceFinding = { kind: "head-cut" | "face-in-margin" | "face-on-fold"; severity: QualitySeverity; params: Record<string, number> };

// The face problems of one photo in its frame: heads cut by the crop or the page edge, faces in
// the safe margin, faces on the fold. A face only counts when its centre shows (a face that's
// mostly out of the frame was left out on purpose, or is someone passing by at the edge).
// Masks are ignored: a fade hero's crop is still its crop, and the fade itself is by design.
export function facesFindings(el: AlbumPhotoElement, page: PageSize, imgAspect: number, faces: FaceRect[], opts: { margin: { x: number; y: number }; fold: boolean }): FaceFinding[] {
  if (!faces.length) return [];
  const { window, toPage } = photoWindow(el, page, imgAspect);
  const out: FaceFinding[] = [];
  const main = mainFaces(faces);

  // Heads cut.
  let cut = 0;
  let worst = 0;
  let worstSeverity: QualitySeverity | null = null;
  for (const f of main) {
    const box = faceBox(f);
    const cx = (box.x0 + box.x1) / 2;
    const cy = (box.y0 + box.y1) / 2;
    if (area(box) <= 0 || cx < window.x0 || cx > window.x1 || cy < window.y0 || cy > window.y1) continue;
    const outside = 1 - area(intersect(box, window)) / area(box);
    const hairTop = Math.max(0, box.y0 - HAIR_MARGIN * (box.y1 - box.y0));
    const hairCut = box.y0 > hairTop ? Math.min(1, Math.max(0, (window.y0 - hairTop) / (box.y0 - hairTop))) : 0;
    const severity: QualitySeverity | null = outside >= HEAD_CUT_ERROR_SHARE ? "error" : outside >= HEAD_EDGE_WARNING_SHARE || hairCut >= HAIR_CUT_WARNING_SHARE ? "warning" : null;
    if (!severity) continue;
    cut++;
    worst = Math.max(worst, outside);
    if (severity === "error" || !worstSeverity) worstSeverity = severity;
  }
  if (worstSeverity) out.push({ kind: "head-cut", severity: worstSeverity, params: { faces: cut, outside: Math.round(worst * 100) } });

  // Positions on the page need the frame unrotated.
  if (el.rotation) return out;
  const pageBox: Box = { x0: 0, y0: 0, x1: 100, y1: 100 };

  // In the safe margin (the page's outer edges; the fold isn't trimmed).
  const safe: Box = { x0: opts.margin.x, y0: opts.margin.y, x1: 100 - opts.margin.x, y1: 100 - opts.margin.y };
  let inMargin = 0;
  for (const f of main) {
    const shown = intersect(faceBox(f), window);
    if (area(shown) <= 0) continue;
    const box = faceBox(f);
    const cx = (box.x0 + box.x1) / 2;
    const cy = (box.y0 + box.y1) / 2;
    if (cx < window.x0 || cx > window.x1 || cy < window.y0 || cy > window.y1) continue;
    const onPage = intersect(toPage(shown), pageBox);
    if (area(onPage) <= 0) continue;
    const share = 1 - area(intersect(onPage, safe)) / area(onPage);
    if (share >= MARGIN_FACE_SHARE) inMargin++;
  }
  if (inMargin) out.push({ kind: "face-in-margin", severity: "warning", params: { faces: inMargin } });

  // On the fold: every face big enough on paper, not only the main ones.
  if (opts.fold) {
    let onFold = 0;
    for (const f of faces) {
      const onPage = intersect(toPage(intersect(faceBox(f), window)), pageBox);
      const width = onPage.x1 - onPage.x0;
      const heightCm = ((onPage.y1 - onPage.y0) / 100) * page.heightCm;
      if (width <= 0 || heightCm < FOLD_FACE_MIN_CM) continue;
      if (Math.min(50 - onPage.x0, onPage.x1 - 50) >= FOLD_SIDE_SHARE * width) onFold++;
    }
    if (onFold) out.push({ kind: "face-on-fold", severity: "warning", params: { faces: onFold } });
  }
  return out;
}

// The printed extent of a text element (% of the page), estimated: the box's width or the
// estimated width of its longest line, whichever is narrower, placed by its alignment; its lines
// one em each, centred in the box's height like every renderer does (albumTextSizing.ts).
export function textInkBox(el: AlbumTextElement, page: PageSize): Box | null {
  const lines = el.text.split("\n").filter((l) => l.trim());
  if (!lines.length) return null;
  const emX = (el.fontSize / 1600) * 100; // one em, in % of the page width
  const emY = emX * (page.widthCm / page.heightCm); // the same em, in % of the page height
  const box = elementBox(el);
  const widths = lines.map((l) => l.trim().length * TEXT_GLYPH_EM * emX);
  // A line wider than the box wraps.
  const rows = widths.reduce((n, w) => n + Math.max(1, Math.ceil(w / box.widthPct)), 0);
  const inkW = Math.min(box.widthPct, Math.max(...widths));
  const inkH = rows * emY;
  const x0 = el.align === "right" ? box.xPct + box.widthPct - inkW : el.align === "left" ? box.xPct : box.xPct + (box.widthPct - inkW) / 2;
  const y0 = box.yPct + (box.heightPct - inkH) / 2;
  return { x0, y0, x1: x0 + inkW, y1: y0 + inkH };
}

// ── The check ────────────────────────────────────────────────────────────────────────────────

const SEVERITY_RANK: Record<QualitySeverity, number> = { warning: 1, error: 2 };

export function checkAlbumQuality(input: QualityInput): QualityIssue[] {
  const { album, spreads, photos, faces } = input;
  const issues: QualityIssue[] = [];
  // Where each photo first appears (the cover and the blurred backgrounds don't count: the auto
  // designer's cover photo appears inside too, and a page's background is one of its own photos,
  // both on purpose).
  const firstSeen = new Map<string, number>();

  spreads.forEach((spread, pageIndex) => {
    const page = pageSizeOf(spread, album);
    const margin = marginPct(page, album);
    const fold = isDoublePage(spread, album);
    const isCover = !!(spread.width_cm && spread.height_cm);
    const base = { spreadId: spread.id, pageIndex };

    for (const el of spread.elements ?? []) {
      if (el.type === "text") {
        const ink = textInkBox(el, page);
        if (!ink) continue;
        const outside = ink.x0 < margin.x || ink.y0 < margin.y || ink.x1 > 100 - margin.x || ink.y1 > 100 - margin.y;
        const onFold = fold && ink.x0 < 50 && ink.x1 > 50;
        if (outside || onFold) issues.push({ ...base, id: `text-outside-margin:${spread.id}:${el.id}`, kind: "text-outside-margin", severity: "warning", elementId: el.id, params: { fold: outside ? 0 : 1 } });
        continue;
      }
      if (el.type !== "photo") continue;

      const photo = el.photoId ? photos.get(el.photoId) : undefined;
      if (!el.photoId || !photo) {
        issues.push({ ...base, id: `empty-frame:${spread.id}:${el.id}`, kind: "empty-frame", severity: "error", elementId: el.id, params: { missing: el.photoId ? 1 : 0 } });
        continue;
      }
      if (!(el.widthPct > 0 && el.heightPct > 0)) continue;
      const photoId = el.photoId;
      const ref = { ...base, elementId: el.id, photoId };

      if (!isCover) {
        const first = firstSeen.get(photoId);
        if (first === undefined) firstSeen.set(photoId, pageIndex);
        else issues.push({ ...ref, id: `duplicate:${spread.id}:${el.id}`, kind: "duplicate", severity: "warning", params: { otherPage: first + 1, samePage: first === pageIndex ? 1 : 0 } });
      }

      const longSideCm = Math.max((el.widthPct / 100) * page.widthCm, (el.heightPct / 100) * page.heightCm);
      if (photo.fileSizeBytes && photo.fileSizeBytes < SMALL_FILE_BYTES && longSideCm >= SMALL_FILE_MIN_SIDE_CM) {
        issues.push({ ...ref, id: `small-file:${spread.id}:${el.id}`, kind: "small-file", severity: "warning", params: { kb: Math.round(photo.fileSizeBytes / 1024), cm: Math.round(longSideCm) } });
      }

      const aspect = photo.aspect && photo.aspect > 0 ? photo.aspect : null;
      if (!aspect) continue;

      // A masked frame (the faded heroes) is cropped by design: its shape follows the layout, and
      // the fade hides its inner edge anyway.
      const crop = cropOf(el, page, aspect);
      if (!el.maskId && crop > HEAVY_CROP_WARNING) {
        const issue: QualityIssue = { ...ref, id: `heavy-crop:${spread.id}:${el.id}`, kind: "heavy-crop", severity: crop > HEAVY_CROP_ERROR ? "error" : "warning", params: { crop: Math.round(crop * 100) / 100 } };
        // The fix gives the frame the photo's shape inside its old box (fitPhotoInFrame,
        // resizable), which only a free frame can take: not tilted, not running off the page,
        // not locked in place, nothing drawn over it. Any other frame can still drop its zoom
        // (the same fit, its shape kept), when that alone brings the crop down.
        const resizable = !el.rotation && !el.locked && !bleedsOffPage(el) && !coveredAbove(el, spread.elements ?? []);
        const fitted = fitPhotoInFrame(elementBox(el), page, aspect, mainFaces(faces(photoId) ?? []), resizable);
        const patch: Partial<AlbumPhotoElement> = resizable ? fitted : { focalX: fitted.focalX, focalY: fitted.focalY, zoom: fitted.zoom };
        if (cropOf({ ...el, ...patch }, page, aspect) <= HEAVY_CROP_WARNING) issue.fix = { elementId: el.id, patch };
        issues.push(issue);
      }

      const known = faces(photoId);
      if (!known?.length) continue;
      const opts = { margin, fold };
      const findings = facesFindings(el, page, aspect, known, opts);
      const before = new Map(findings.map((f) => [f.kind, SEVERITY_RANK[f.severity]]));
      for (const finding of findings) {
        const issue: QualityIssue = { ...ref, id: `${finding.kind}:${spread.id}:${el.id}`, kind: finding.kind, severity: finding.severity, params: finding.params };
        // Moving the crop (fitPhotoInFrame, the frame stays) can fix a cut head or a face in the
        // margin; it's offered only when checking the moved crop shows the problem gone and nothing
        // else got worse. A face on the fold needs the layout changed: the jump only.
        if (finding.kind !== "face-on-fold") {
          const fitted = fitPhotoInFrame(el, page, aspect, mainFaces(known), false);
          const patch = { focalX: fitted.focalX, focalY: fitted.focalY, zoom: fitted.zoom };
          const after = facesFindings({ ...el, ...patch }, page, aspect, known, opts);
          const solved = after.every((a) => a.kind !== finding.kind && SEVERITY_RANK[a.severity] <= (before.get(a.kind) ?? 0));
          if (solved) issue.fix = { elementId: el.id, patch };
        }
        issues.push(issue);
      }
    }
  });

  return issues.sort(
    (a, b) => a.pageIndex - b.pageIndex || SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity] || KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind)
  );
}

// The pages' new elements once the given fixes are applied, one fix per photo: a frame that gets
// the photo's shape (heavy crop) shows all of it, which also settles a cut head, so that fix wins;
// otherwise the first. A fix whose element is gone is skipped.
export function qualityFixPatches(spreads: QualitySpread[], issues: QualityIssue[]): Map<string, AlbumElement[]> {
  const chosen = new Map<string, QualityFix>(); // `${spreadId}:${elementId}` → fix
  for (const issue of issues) {
    if (!issue.fix) continue;
    const key = `${issue.spreadId}:${issue.fix.elementId}`;
    if (!chosen.has(key) || issue.kind === "heavy-crop") chosen.set(key, issue.fix);
  }
  const out = new Map<string, AlbumElement[]>();
  for (const spread of spreads) {
    let changed = false;
    const elements = (spread.elements ?? []).map((el) => {
      const fix = el.type === "photo" ? chosen.get(`${spread.id}:${el.id}`) : undefined;
      if (!fix) return el;
      changed = true;
      return { ...el, ...fix.patch } as AlbumElement;
    });
    if (changed) out.set(spread.id, elements);
  }
  return out;
}

// Count of problems per page, for the badge on its thumbnail.
export function issuesByPage(issues: QualityIssue[]): Map<string, { errors: number; warnings: number }> {
  const out = new Map<string, { errors: number; warnings: number }>();
  for (const issue of issues) {
    const c = out.get(issue.spreadId) ?? { errors: 0, warnings: 0 };
    if (issue.severity === "error") c.errors++;
    else c.warnings++;
    out.set(issue.spreadId, c);
  }
  return out;
}

// Every photo placed in the album, in page order (the photos whose faces the check needs).
export function albumPhotoIds(spreads: QualitySpread[]): string[] {
  const ids = new Set<string>();
  for (const spread of spreads) for (const el of spread.elements ?? []) if (el.type === "photo" && el.photoId) ids.add(el.photoId);
  return [...ids];
}
