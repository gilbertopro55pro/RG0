import sharp from "sharp";
import { writePsdBuffer, type Layer } from "ag-psd";
import { downloadObjectBuffer } from "@/lib/storage";
import { resolvePageElements, coverCropRaw, svgTextLayer } from "@/lib/albumRaster";
import type { GalleryAlbumRow, GalleryAlbumSpreadRow, GalleryPhotoRow } from "@/lib/types";

async function pngToRawRgba(buffer: Buffer): Promise<{ data: Buffer; width: number; height: number }> {
  const { data, info } = await sharp(buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}

// Builds a real, layered .psd — each photo is its own positioned raster layer, and a black & white
// filter becomes an actual clipped Photoshop "Black & White" adjustment layer (not baked into
// pixels), so it stays live and removable/tweakable once opened in Photoshop. Sepia is baked into
// the pixel data instead (same as the JPG export) — ag-psd supports adjustment layers in general,
// but there's no clean native "sepia" one, and approximating it via a chain of adjustments wasn't
// worth the added complexity for a first version.
export async function renderAlbumPagePsd({
  album,
  spread,
  isCover,
  pageWidthPx,
  pageHeightPx,
  photosById,
}: {
  album: GalleryAlbumRow;
  spread: GalleryAlbumSpreadRow | null;
  isCover: boolean;
  pageWidthPx: number;
  pageHeightPx: number;
  photosById: Map<string, Pick<GalleryPhotoRow, "id" | "storage_path">>;
}): Promise<Buffer | null> {
  const children: Layer[] = [
    {
      name: "רקע",
      top: 0,
      left: 0,
      bottom: pageHeightPx,
      right: pageWidthPx,
      imageData: { data: new Uint8Array(pageWidthPx * pageHeightPx * 4).fill(255), width: pageWidthPx, height: pageHeightPx },
    },
  ];

  if (isCover) {
    const photo = album.cover_photo_id ? photosById.get(album.cover_photo_id) : null;
    const buffer = photo ? await downloadObjectBuffer("galleries", photo.storage_path) : null;
    const cropped = buffer ? await coverCropRaw(buffer, pageWidthPx, pageHeightPx, 50, 50, undefined, false) : null;
    if (!cropped) return null;
    children.push({ name: "תמונת שער", top: 0, left: 0, bottom: pageHeightPx, right: pageWidthPx, imageData: { data: cropped.data, width: cropped.width, height: cropped.height } });
    const bandHeight = Math.round(pageHeightPx * 0.19);
    const titlePng = await svgTextLayer(album.title, {
      xPx: 0,
      yPx: pageHeightPx - bandHeight * 0.62,
      widthPx: pageWidthPx,
      fontSizePx: Math.round(pageWidthPx * 0.032),
      color: "#ffffff",
      align: "center",
      pageWidthPx,
      pageHeightPx,
    });
    const titleRgba = await pngToRawRgba(titlePng);
    children.push({ name: "כותרת", top: 0, left: 0, bottom: titleRgba.height, right: titleRgba.width, imageData: { data: titleRgba.data, width: titleRgba.width, height: titleRgba.height } });
    return writePsdBuffer({ width: pageWidthPx, height: pageHeightPx, children });
  }

  if (!spread) return null;
  const elements = resolvePageElements(spread, pageWidthPx, pageHeightPx);
  let any = false;
  for (const el of elements) {
    if (el.kind === "text") {
      const png = await svgTextLayer(el.text, { xPx: el.x, yPx: el.y, widthPx: el.width, fontSizePx: el.fontSizePx, color: el.color === "white" ? "#ffffff" : "#000000", align: el.align, pageWidthPx, pageHeightPx });
      const rgba = await pngToRawRgba(png);
      children.push({ name: "טקסט", top: 0, left: 0, bottom: rgba.height, right: rgba.width, imageData: { data: rgba.data, width: rgba.width, height: rgba.height } });
      continue;
    }
    if (!el.photoId) continue;
    const photo = photosById.get(el.photoId);
    const buffer = photo ? await downloadObjectBuffer("galleries", photo.storage_path) : null;
    if (!buffer) continue;
    const width = Math.max(1, Math.round(el.width));
    const height = Math.max(1, Math.round(el.height));
    // Never bake B&W into the pixels here — it becomes a real adjustment layer below instead.
    const cropped = await coverCropRaw(buffer, width, height, el.focalX, el.focalY, el.filter === "sepia" ? "sepia" : undefined, false);
    if (!cropped) continue;
    any = true;
    const top = Math.round(el.y);
    const left = Math.round(el.x);
    children.push({ name: "תמונה", top, left, bottom: top + height, right: left + width, imageData: { data: cropped.data, width: cropped.width, height: cropped.height } });
    if (el.filter === "bw") {
      children.push({ name: "שחור-לבן", clipping: true, adjustment: { type: "black & white" } });
    }
    if (el.borderWidth) {
      const strokeSvg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg"><rect x="${el.borderWidth / 2}" y="${el.borderWidth / 2}" width="${width - el.borderWidth}" height="${height - el.borderWidth}" fill="none" stroke="${el.borderColor ?? "#ffffff"}" stroke-width="${el.borderWidth}"/></svg>`;
      const strokeRgba = await pngToRawRgba(Buffer.from(strokeSvg));
      children.push({ name: "מסגרת", top, left, bottom: top + height, right: left + width, imageData: { data: strokeRgba.data, width: strokeRgba.width, height: strokeRgba.height } });
    }
  }
  if (!any && !elements.some((e) => e.kind === "text")) return null;

  return writePsdBuffer({ width: pageWidthPx, height: pageHeightPx, children });
}
