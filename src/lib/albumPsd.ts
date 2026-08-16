import sharp from "sharp";
import { writePsdBuffer, type Layer, type LayerEffectsInfo } from "ag-psd";
import { downloadObjectBuffer } from "@/lib/storage";
import { resolvePageElements, coverCropRaw, composePhotoTile, svgTextLayer } from "@/lib/albumRaster";
import type { GalleryAlbumRow, GalleryAlbumSpreadRow, GalleryPhotoRow } from "@/lib/types";

async function pngToRawRgba(buffer: Buffer): Promise<{ data: Buffer; width: number; height: number }> {
  const { data, info } = await sharp(buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}

// Real, live Photoshop "Drop Shadow" Layer Style effect — editable in Photoshop's own Layer Style
// dialog exactly as if applied by hand. The blur/offset/opacity numbers mirror boxShadowFor()
// exactly, so it looks the same as the builder preview. Distance/angle approximate CSS's fixed
// down-right offset as Photoshop's polar distance+angle form.
//
// The border/stroke is deliberately NOT a live effect here, despite ag-psd technically exposing
// `effects.stroke` — tried it (round-tripped cleanly through ag-psd's own reader, and matched a
// real Photoshop-authored fixture's field shapes as closely as could be verified from outside
// Photoshop itself), but real Photoshop still reported "problems reading layers" and never
// rendered the stroke. Without access to real Photoshop to iterate against, further attempts
// would just be more blind guessing at the exact binary layer-effects encoding it expects — not
// worth risking file corruption for. Border goes back to being baked into the photo's own pixels
// via composePhotoTile below (the same proven-reliable approach used before this attempt, and
// still what rotated photos need anyway, since a PSD layer has no rotation field of its own — the
// border has to be part of the same rotated tile as the photo either way).
function buildPhotoLayerEffects(shadowPct: number | undefined): LayerEffectsInfo | undefined {
  if (!shadowPct) return undefined;
  const blurPx = Math.max(1, (shadowPct / 100) * 24);
  const offsetPx = Math.round((shadowPct / 100) * 10);
  // ag-psd's `opacity` field is a 0-1 fraction (unitsPercent() multiplies by 100 internally to
  // build the actual PSD Percent descriptor) — confirmed against a real Photoshop-authored test
  // fixture in ag-psd's own repo, whose effect opacities all came back as 0-1 values.
  const opacityFraction = 0.15 + (shadowPct / 100) * 0.45;
  return {
    dropShadow: [
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
    ],
  };
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

    // Border is baked into the photo's own pixels (bundled into the same rotated tile as the
    // photo when rotated, so it spins together as one rigid unit — see composePhotoTile).
    // Opacity stays a live PSD layer property. Blur has no from-scratch-authorable Smart Filter
    // equivalent, so it's baked into the pixels too. Shadow is the one still live (see
    // buildPhotoLayerEffects).
    const tile = await composePhotoTile(buffer, width, height, el.focalX, el.focalY, el.filter === "sepia" ? "sepia" : undefined, false, {
      rotation: el.rotation,
      blur: el.blur,
      zoom: el.zoom,
      borderWidth: el.borderWidth,
      borderColor: el.borderColor,
    });
    if (!tile) continue;
    any = true;
    const top = Math.round(frameTop + tile.top);
    const left = Math.round(frameLeft + tile.left);
    const effects = buildPhotoLayerEffects(el.shadow);
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
