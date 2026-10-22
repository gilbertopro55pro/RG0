import type { AlbumElement, AlbumPhotoElement } from "@/lib/types";

// Swapping two photos between album pages (the preview's swap mode, owner 2026-09-30): each photo
// takes the other's frame. The crop resets to a face-friendly upper-centre focal, and a page whose
// blurred background was the photo that left gets the one that came in, so the background still
// matches its page. Returns the patch per changed page, or null when there's nothing to swap.
export type SwapPick = { spreadId: string; elId: string };
type SpreadLike = { id: string; elements: AlbumElement[] | null; background_photo_id: string | null };

// How a photo sits in the frame it moved into: by default the crop resets (below). The admin's swap
// (owner, 2026-10-20: "לוודא שהתמונה לא נחתכת ונכנסת למסגרת ממורכזת בלי חיתוך של הראש") fits it
// with fitPhotoInFrame instead.
export type SwapFit = (el: AlbumPhotoElement, spreadId: string, photoId: string) => Partial<AlbumPhotoElement>;

export function swapPhotoPatches(
  spreads: SpreadLike[],
  a: SwapPick,
  b: SwapPick,
  fit?: SwapFit
): Map<string, { elements: AlbumElement[]; background_photo_id: string | null }> | null {
  const sa = spreads.find((sp) => sp.id === a.spreadId);
  const sb = spreads.find((sp) => sp.id === b.spreadId);
  const ea = sa?.elements?.find((el): el is AlbumPhotoElement => el.id === a.elId && el.type === "photo");
  const eb = sb?.elements?.find((el): el is AlbumPhotoElement => el.id === b.elId && el.type === "photo");
  if (!sa || !sb || !ea || !eb || ea.photoId === eb.photoId) return null;
  const pa = ea.photoId;
  const pb = eb.photoId;
  const reset = { focalX: 50, focalY: 40, zoom: 100 };
  const out = new Map<string, { elements: AlbumElement[]; background_photo_id: string | null }>();
  for (const sp of sa.id === sb.id ? [sa] : [sa, sb]) {
    const elements = (sp.elements ?? []).map((el) => {
      if (sp.id === a.spreadId && el.id === a.elId) return { ...el, photoId: pb, ...(fit && pb ? fit(el as AlbumPhotoElement, sp.id, pb) : reset) } as AlbumElement;
      if (sp.id === b.spreadId && el.id === b.elId) return { ...el, photoId: pa, ...(fit && pa ? fit(el as AlbumPhotoElement, sp.id, pa) : reset) } as AlbumElement;
      return el;
    });
    const bg = sp.background_photo_id;
    const background_photo_id = sa.id === sb.id ? bg : sp.id === a.spreadId && bg === pa ? pb : sp.id === b.spreadId && bg === pb ? pa : bg;
    out.set(sp.id, { elements, background_photo_id });
  }
  return out;
}

// A face's box, as fractions of the image (lib/faceRecognition.ts detectFacesInImageUrl).
export type FaceRect = { x: number; y: number; width: number; height: number };

// The most a swapped photo may be cropped before its frame takes the photo's shape instead.
export const SWAP_MAX_CROP = 1.15;

// Fits a photo into a frame (the admin's swap): a frame much wider or taller than the photo
// (cropping more than SWAP_MAX_CROP) shrinks to the photo's own shape inside its old box, centred,
// so nothing is cut; a frame that can't change shape (masked, rotated, or bleeding off the page)
// keeps it. When the photo is still cropped, the visible part follows the faces: all of them
// across, and down from just above the highest head, so no head is cut. Without faces: the centre,
// a little above the middle. The frame's box is in % of the page; the page size in cm gives its shape.
export function fitPhotoInFrame(
  frame: { xPct: number; yPct: number; widthPct: number; heightPct: number },
  page: { widthCm: number; heightCm: number },
  imgAspect: number,
  faces: FaceRect[],
  resizable: boolean
): { xPct: number; yPct: number; widthPct: number; heightPct: number; focalX: number; focalY: number; zoom: number } {
  const round = (n: number) => Math.round(n * 100) / 100;
  // Only the box: the caller passes a whole frame element, and a spread of it would carry its old
  // photoId over the photo the swap just placed (the bug that made the admin's swap move nothing).
  const box = { xPct: frame.xPct, yPct: frame.yPct, widthPct: frame.widthPct, heightPct: frame.heightPct };
  const frameAspect = (frame.widthPct * page.widthCm) / (frame.heightPct * page.heightCm) || 1;
  const img = imgAspect > 0 ? imgAspect : frameAspect;
  const crop = img >= frameAspect ? img / frameAspect : frameAspect / img;
  if (resizable && crop > SWAP_MAX_CROP) {
    if (img > frameAspect) {
      const heightPct = (frame.widthPct * page.widthCm) / img / page.heightCm;
      return { ...box, yPct: round(frame.yPct + (frame.heightPct - heightPct) / 2), heightPct: round(heightPct), focalX: 50, focalY: 50, zoom: 100 };
    }
    const widthPct = (frame.heightPct * page.heightCm * img) / page.widthCm;
    return { ...box, xPct: round(frame.xPct + (frame.widthPct - widthPct) / 2), widthPct: round(widthPct), focalX: 50, focalY: 50, zoom: 100 };
  }
  // The share of the photo that shows across and down (1 = all of it).
  const vx = img > frameAspect ? frameAspect / img : 1;
  const vy = img > frameAspect ? 1 : img / frameAspect;
  if (!faces.length) return { ...box, focalX: 50, focalY: vy < 1 ? 40 : 50, zoom: 100 };
  const left = Math.min(...faces.map((f) => f.x));
  const right = Math.max(...faces.map((f) => f.x + f.width));
  const faceH = Math.max(...faces.map((f) => f.height));
  // Hair above the face box, the chin below it.
  const top = Math.max(0, Math.min(...faces.map((f) => f.y)) - 0.35 * faceH);
  const bottom = Math.min(1, Math.max(...faces.map((f) => f.y + f.height)) + 0.15 * faceH);
  const clamp = (v: number, max: number) => Math.min(Math.max(v, 0), max);
  let focalX = 50;
  if (vx < 1) {
    const start = clamp((left + right) / 2 - vx / 2, 1 - vx);
    focalX = (start / (1 - vx)) * 100;
  }
  let focalY = 50;
  if (vy < 1) {
    // The heads fit: a third of the spare room above them. They don't: start just above the highest.
    const span = bottom - top;
    const start = clamp(span <= vy ? top - (vy - span) / 3 : top, 1 - vy);
    focalY = (start / (1 - vy)) * 100;
  }
  return { ...box, focalX: round(focalX), focalY: round(focalY), zoom: 100 };
}
