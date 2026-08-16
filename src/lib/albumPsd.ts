import sharp from "sharp";
import { writePsdBuffer, type Layer, type LayerEffectsInfo } from "ag-psd";
import { downloadObjectBuffer } from "@/lib/storage";
import { resolvePageElements, coverCropRaw, composePhotoTile, svgTextLayer } from "@/lib/albumRaster";
import type { GalleryAlbumRow, GalleryAlbumSpreadRow, GalleryPhotoRow } from "@/lib/types";

async function pngToRawRgba(buffer: Buffer): Promise<{ data: Buffer; width: number; height: number }> {
  const { data, info } = await sharp(buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const clean = hex.replace("#", "");
  const full = clean.length === 3 ? clean.split("").map((c) => c + c).join("") : clean;
  const n = parseInt(full, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

// Real, live Photoshop Layer Style effects — a Drop Shadow and a Stroke, editable in Photoshop's
// own Layer Style dialog exactly as if applied by hand, instead of the old approach of baking a
// separate flat "shadow"/"border" raster layer next to the photo. The blur/offset/opacity numbers
// mirror boxShadowFor()/the old shadowLayerPng() exactly, so the shadow looks the same as the
// builder preview and the JPG export; the border's `size` reuses the app's existing pixel-count
// convention unchanged. Distance/angle approximate CSS's fixed down-right offset as Photoshop's
// polar distance+angle form — close enough to land right, and it's live/editable in Photoshop if
// a photographer wants to nudge it.
function buildPhotoLayerEffects(shadowPct: number | undefined, borderWidth: number | undefined, borderColor: string | undefined): LayerEffectsInfo | undefined {
  const effects: LayerEffectsInfo = {};
  if (shadowPct) {
    const blurPx = Math.max(1, (shadowPct / 100) * 24);
    const offsetPx = Math.round((shadowPct / 100) * 10);
    // ag-psd's `opacity` field is a 0-1 fraction (unitsPercent() multiplies by 100 internally to
    // build the actual PSD Percent descriptor) — confirmed against a real Photoshop-authored test
    // fixture in ag-psd's own repo, whose effect opacities all came back as 0-1 values. Passing a
    // raw 0-100 percent here (as an earlier version of this code did) writes a wildly out-of-range
    // Percent value into the file, which is what made real Photoshop refuse to read these layers.
    const opacityFraction = 0.15 + (shadowPct / 100) * 0.45;
    effects.dropShadow = [
      {
        enabled: true,
        present: true,
        showInDialog: false,
        useGlobalLight: false,
        angle: 135,
        distance: { units: "Pixels", value: Math.round(offsetPx * Math.SQRT2) },
        size: { units: "Pixels", value: Math.round(blurPx) },
        color: { r: 0, g: 0, b: 0 },
        opacity: opacityFraction,
        blendMode: "multiply",
      },
    ];
  }
  if (borderWidth) {
    effects.stroke = [
      {
        enabled: true,
        present: true,
        showInDialog: false,
        size: { units: "Pixels", value: borderWidth },
        position: "center",
        fillType: "color",
        color: hexToRgb(borderColor ?? "#ffffff"),
        opacity: 1,
        blendMode: "normal",
      },
    ];
  }
  return Object.keys(effects).length > 0 ? effects : undefined;
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

  if (spread.background_photo_id) {
    const bgPhoto = photosById.get(spread.background_photo_id);
    const bgBuffer = bgPhoto ? await downloadObjectBuffer("galleries", bgPhoto.storage_path) : null;
    const bgCropped = bgBuffer ? await coverCropRaw(bgBuffer, pageWidthPx, pageHeightPx, 50, 50, undefined, false, { blur: spread.background_blur }) : null;
    if (bgCropped) {
      children.push({
        name: "רקע עמוד",
        top: 0,
        left: 0,
        bottom: pageHeightPx,
        right: pageWidthPx,
        opacity: spread.background_opacity / 100,
        imageData: { data: bgCropped.data, width: bgCropped.width, height: bgCropped.height },
      });
    }
  }

  const elements = resolvePageElements(spread, pageWidthPx, pageHeightPx);
  let any = false;
  for (const el of elements) {
    if (el.kind === "text") {
      const png = await svgTextLayer(el.text, {
        xPx: el.x,
        yPx: el.y,
        widthPx: el.width,
        fontSizePx: el.fontSizePx,
        color: el.color === "white" ? "#ffffff" : "#000000",
        align: el.align,
        pageWidthPx,
        pageHeightPx,
        fontFamily: el.fontFamily,
      });
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
    const frameTop = Math.round(el.y);
    const frameLeft = Math.round(el.x);

    // Border, shadow, and opacity all stay live, editable Photoshop layer properties/Layer
    // Style effects — never baked into pixels — for rotated photos exactly the same as
    // unrotated ones now (composePhotoTile with no borderWidth just crops/zooms/rotates the
    // photo itself, nothing more). Blur is the one exception: there's no from-scratch-authorable
    // Smart Filter equivalent, so it's still baked into the pixels here.
    const tile = await composePhotoTile(buffer, width, height, el.focalX, el.focalY, el.filter === "sepia" ? "sepia" : undefined, false, {
      rotation: el.rotation,
      blur: el.blur,
      zoom: el.zoom,
    });
    if (!tile) continue;
    any = true;
    const top = Math.round(frameTop + tile.top);
    const left = Math.round(frameLeft + tile.left);
    const effects = buildPhotoLayerEffects(el.shadow, el.borderWidth, el.borderColor);
    children.push({
      name: "תמונה",
      top,
      left,
      bottom: top + tile.height,
      right: left + tile.width,
      opacity: (el.opacity ?? 100) / 100,
      imageData: { data: tile.data, width: tile.width, height: tile.height },
      ...(effects ? { effects } : {}),
    });
    if (el.filter === "bw") {
      children.push({ name: "שחור-לבן", clipping: true, adjustment: { type: "black & white" } });
    }
  }
  if (!any && !elements.some((e) => e.kind === "text") && !spread.background_photo_id) return null;

  return writePsdBuffer({ width: pageWidthPx, height: pageHeightPx, children });
}
