import { collageCrop, type CollageCell, type CollageFace } from "@/lib/collage/layout";

// Draws one collage cell on a canvas (browser only): the photo cut to the cell's shape around its
// faces (collageCrop). The preview and the exported file both draw through here, at their own size,
// so they show the same picture. Cell edges are rounded to whole pixels from the page's edges, so
// neighbouring photos meet the gap exactly, with no seam or overlap.
export function cellPixels(cell: CollageCell, width: number, height: number) {
  const x0 = Math.round(cell.x * width);
  const y0 = Math.round(cell.y * height);
  const x1 = Math.round((cell.x + cell.w) * width);
  const y1 = Math.round((cell.y + cell.h) * height);
  return { x: x0, y: y0, w: Math.max(1, x1 - x0), h: Math.max(1, y1 - y0) };
}

// The preview photos (2026-11-04, a phone crashed after a few rounds of "תמונות אחרות"): drawing an
// <img> on a canvas makes the browser keep a decoded copy of it for as long as the page lives, even
// after the <img> is let go (measured in Chromium: about 4MB per photo, 230MB → 740MB after 120
// photos). Each preview is drawn from an ImageBitmap instead, closed when its photo leaves the
// collage, and decoded only as big as the preview canvas needs: the longer side up to a quarter more
// than the canvas is wide (a cell is never wider than the page, and a crop of up to 1.45 shows a part
// of the photo), never more than the preview itself (1200px).
export const PREVIEW_MAX_SIDE = 1200;

export function previewDecodeLong(boxWidthCss: number, dpr: number): number {
  if (!(boxWidthCss > 0)) return PREVIEW_MAX_SIDE;
  return Math.min(PREVIEW_MAX_SIDE, Math.ceil(boxWidthCss * Math.min(2, Math.max(1, dpr || 1)) * 1.25));
}

// The size to decode a photo of this size at for `targetLong`, or null to keep its own size.
export function previewDecodeSize(naturalWidth: number, naturalHeight: number, targetLong: number): { width: number; height: number } | null {
  const long = Math.max(naturalWidth, naturalHeight);
  if (!(long > 0) || !(targetLong > 0) || long <= targetLong) return null;
  const scale = targetLong / long;
  return { width: Math.max(1, Math.round(naturalWidth * scale)), height: Math.max(1, Math.round(naturalHeight * scale)) };
}

// A photo decoded smaller than the canvas now needs (the phone turned, the window grew) is decoded
// again, once it's clearly too small: not for a few pixels.
export function previewNeedsRedecode(decodedLong: number, naturalLong: number, targetLong: number): boolean {
  if (!(decodedLong > 0) || !(naturalLong > 0)) return false;
  return decodedLong < Math.min(naturalLong, targetLong) * 0.85;
}

export function drawCollageCell(
  ctx: CanvasRenderingContext2D,
  cell: CollageCell,
  width: number,
  height: number,
  image: CanvasImageSource,
  imageWidth: number,
  imageHeight: number,
  faces?: CollageFace[]
) {
  const px = cellPixels(cell, width, height);
  const crop = collageCrop(imageWidth / imageHeight, px.w / px.h, faces);
  ctx.drawImage(image, crop.sx * imageWidth, crop.sy * imageHeight, crop.sw * imageWidth, crop.sh * imageHeight, px.x, px.y, px.w, px.h);
}
