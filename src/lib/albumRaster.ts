import fs from "node:fs/promises";
import path from "node:path";
import sharp, { type OverlayOptions } from "sharp";
import fontkit from "@pdf-lib/fontkit";
import { downloadObjectBuffer } from "@/lib/storage";
import { getAlbumFontFiles } from "@/lib/albumFontFiles";
import type { AlbumElement, AlbumPhotoFilter, GalleryAlbumRow, GalleryAlbumSpreadRow, GalleryPhotoRow } from "@/lib/types";

const DPI = 300;

export function pxFromCm(cm: number): number {
  return Math.max(200, Math.round((cm / 2.54) * DPI));
}

// A shared cap so a blur % looks the same on a framed photo or the full-page background — see the
// identical constant (and rationale) in AlbumSpreadCanvasEditor.tsx, which this mirrors exactly so
// the exported JPG matches the builder preview.
export const ALBUM_BLUR_MAX_PX = 40;

// Text is rendered as raw glyph outlines (SVG <path>s from fontkit), never as an SVG <text>
// element with @font-face — confirmed empirically that sharp/librsvg's text renderer on Vercel's
// Node runtime produces fully blank glyphs for every custom font (data-URI embedded or not),
// because the environment ships with no fontconfig config at all and Pango/HarfBuzz text shaping
// depends on it (sharp/lovell#2499 — and, in this case, even a from-scratch fontconfig config
// pointed at a real font directory didn't unblock it). Glyph-outline paths sidestep that whole
// font-matching layer: fontkit parses the TTF directly in pure JS and hands back vector paths, so
// rendering them is just basic SVG fill geometry — no text shaping engine involved at all.
const fontkitFontCache = new Map<string, ReturnType<typeof fontkit.create>>();
async function loadFontkitFont(file: string): Promise<ReturnType<typeof fontkit.create>> {
  const cached = fontkitFontCache.get(file);
  if (cached) return cached;
  const buf = await fs.readFile(path.join(process.cwd(), "src/assets/fonts", file));
  const font = fontkit.create(buf);
  fontkitFontCache.set(file, font);
  return font;
}

const HEBREW_RANGE = /[֐-׿]/;
type BidiRun = { text: string; rtl: boolean };

// Same lightweight run-splitter as src/lib/pdfText.ts (kept as a separate copy since this module
// lays glyphs out on an SVG canvas rather than a PDF page, but the bidi logic itself is identical).
function splitBidiRuns(text: string): BidiRun[] {
  const runs: BidiRun[] = [];
  let current = "";
  let currentRtl: boolean | null = null;
  for (const ch of text) {
    const isRtl: boolean = ch === " " ? (currentRtl ?? HEBREW_RANGE.test(text)) : HEBREW_RANGE.test(ch);
    if (currentRtl === null) currentRtl = isRtl;
    if (isRtl !== currentRtl) {
      runs.push({ text: current, rtl: currentRtl });
      current = "";
      currentRtl = isRtl;
    }
    current += ch;
  }
  if (current) runs.push({ text: current, rtl: currentRtl ?? true });
  return runs;
}

// Lays out mixed Hebrew/Latin text as glyph-outline SVG paths, in true RTL-paragraph visual order
// (runs right-to-left overall, Hebrew runs' characters reversed since Hebrew doesn't contextually
// shape, Latin/digit runs kept natural) — returns the paths already positioned along a single
// baseline at x=0, plus the total ink width so the caller can align/center the whole block.
async function layoutTextAsSvgPaths(text: string, fontFamily: string | undefined, fontSizePx: number): Promise<{ pathsSvg: string; width: number }> {
  const { hebrewFile, latinFile } = getAlbumFontFiles(fontFamily);
  const [hebrewFont, latinFont] = await Promise.all([loadFontkitFont(hebrewFile), loadFontkitFont(latinFile)]);

  const visualRuns = splitBidiRuns(text)
    .reverse()
    .map((r) => ({ text: r.rtl ? [...r.text].reverse().join("") : r.text, font: r.rtl ? hebrewFont : latinFont }));

  let cursorX = 0;
  const parts: string[] = [];
  for (const run of visualRuns) {
    if (!run.text) continue;
    const glyphRun = run.font.layout(run.text);
    const scale = fontSizePx / run.font.unitsPerEm;
    for (let i = 0; i < glyphRun.glyphs.length; i++) {
      const glyph = glyphRun.glyphs[i];
      const pos = glyphRun.positions[i];
      const d = glyph.path.toSVG();
      if (d) {
        const gx = cursorX + (pos.xOffset ?? 0) * scale;
        const gy = -(pos.yOffset ?? 0) * scale;
        // Glyph outlines are in font units with Y pointing up (baseline at 0); SVG's Y points
        // down, so the negative Y scale flips each glyph right-side up in SVG space.
        parts.push(`<path d="${d}" transform="translate(${gx},${gy}) scale(${scale},${-scale})" />`);
      }
      cursorX += pos.xAdvance * scale;
    }
  }
  return { pathsSvg: parts.join(""), width: cursorX };
}

async function svgTextLayer(
  text: string,
  opts: {
    xPx: number;
    yPx: number;
    widthPx: number;
    fontSizePx: number;
    color: string;
    align: "right" | "center" | "left";
    pageWidthPx: number;
    pageHeightPx: number;
    fontFamily?: string;
  }
): Promise<Buffer> {
  const { pathsSvg, width } = await layoutTextAsSvgPaths(text, opts.fontFamily, opts.fontSizePx);
  const startX = opts.align === "right" ? opts.xPx + opts.widthPx - width : opts.align === "left" ? opts.xPx : opts.xPx + (opts.widthPx - width) / 2;
  const baselineY = opts.yPx + opts.fontSizePx;
  const svg = `<svg width="${opts.pageWidthPx}" height="${opts.pageHeightPx}" xmlns="http://www.w3.org/2000/svg">
<g fill="${opts.color}" transform="translate(${startX},${baselineY})">${pathsSvg}</g>
</svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

type ResolvedPhoto = {
  kind: "photo";
  photoId: string | null;
  x: number;
  y: number;
  width: number;
  height: number;
  focalX: number;
  focalY: number;
  filter?: AlbumPhotoFilter;
  borderWidth?: number;
  borderColor?: string;
  rotation?: number;
  opacity?: number;
  blur?: number;
  shadow?: number;
  zoom?: number;
};
type ResolvedText = { kind: "text"; text: string; x: number; y: number; width: number; fontSizePx: number; color: string; align: "right" | "center" | "left"; fontFamily?: string };
type Resolved = ResolvedPhoto | ResolvedText;

const GAP_FRAC = 0.005;

// Mirrors the exact layout math used in the CSS builder/proofing views and in albumPdf.ts, just
// resolved to page pixels instead of percentages/points — kept as its own function (rather than
// sharing code across three very different renderers) because the three consumers manipulate
// completely different primitives (DOM styles, pdf-lib operators, sharp composites).
function resolvePageElements(spread: GalleryAlbumSpreadRow, pageWidthPx: number, pageHeightPx: number): Resolved[] {
  const gap = Math.round(pageWidthPx * GAP_FRAC);
  const textElements: ResolvedText[] = spread.elements
    .filter((el): el is Extract<AlbumElement, { type: "text" }> => el.type === "text")
    .map((el) => ({
      kind: "text",
      text: el.text,
      x: (el.xPct / 100) * pageWidthPx,
      y: (el.yPct / 100) * pageHeightPx,
      width: (el.widthPct / 100) * pageWidthPx,
      // el.fontSize is points on the album's fixed 1600pt PDF reference canvas (see the
      // AlbumFontSizePt comment in types.ts) — the same ratio scales it to this page's own width.
      fontSizePx: (el.fontSize / 1600) * pageWidthPx,
      color: el.color,
      align: el.align,
      fontFamily: el.fontFamily,
    }));

  if (spread.layout === "custom") {
    const photos: ResolvedPhoto[] = spread.elements
      .filter((el): el is Extract<AlbumElement, { type: "photo" }> => el.type === "photo")
      .map((el) => ({
        kind: "photo",
        photoId: el.photoId,
        x: (el.xPct / 100) * pageWidthPx,
        y: (el.yPct / 100) * pageHeightPx,
        width: (el.widthPct / 100) * pageWidthPx,
        height: (el.heightPct / 100) * pageHeightPx,
        focalX: el.focalX,
        focalY: el.focalY,
        filter: el.filter,
        borderWidth: el.borderWidth,
        borderColor: el.borderColor,
        rotation: el.rotation,
        opacity: el.opacity,
        blur: el.blur,
        shadow: el.shadow,
        zoom: el.zoom,
      }));
    return [...photos, ...textElements];
  }

  if (!spread.photo_id_2) {
    return [
      { kind: "photo", photoId: spread.photo_id_1, x: 0, y: 0, width: pageWidthPx, height: pageHeightPx, focalX: spread.focal_x_1, focalY: spread.focal_y_1 },
      ...textElements,
    ];
  }
  if (spread.layout === "stack") {
    const halfH = (pageHeightPx - gap) / 2;
    return [
      { kind: "photo", photoId: spread.photo_id_1, x: 0, y: 0, width: pageWidthPx, height: halfH, focalX: spread.focal_x_1, focalY: spread.focal_y_1 },
      { kind: "photo", photoId: spread.photo_id_2, x: 0, y: halfH + gap, width: pageWidthPx, height: halfH, focalX: spread.focal_x_2, focalY: spread.focal_y_2 },
      ...textElements,
    ];
  }
  const ratio1 = spread.layout === "feature" ? 1.6 : 1;
  const width1 = ((pageWidthPx - gap) * ratio1) / (ratio1 + 1);
  const width2 = pageWidthPx - gap - width1;
  // photo1 renders on the right in the app's RTL UI — mirrored here to match every other renderer.
  return [
    { kind: "photo", photoId: spread.photo_id_2, x: 0, y: 0, width: width2, height: pageHeightPx, focalX: spread.focal_x_2, focalY: spread.focal_y_2 },
    { kind: "photo", photoId: spread.photo_id_1, x: width2 + gap, y: 0, width: width1, height: pageHeightPx, focalX: spread.focal_x_1, focalY: spread.focal_y_1 },
    ...textElements,
  ];
}

// Crops+scales a decoded image to exactly fill a target box (CSS object-fit:cover equivalent),
// aimed at the given focal point, with the photo's filter baked into the pixels. Returns raw RGBA
// — the caller either composites it straight into a flattened page (JPG) or hands it to ag-psd as
// an independent layer (PSD), so it stays filter-agnostic about the destination. Rotation is
// intentionally NOT handled here any more (see composePhotoTile) — it needs the border baked in
// first so the two rotate together as one rigid tile.
async function coverCropRaw(
  buffer: Buffer,
  targetWidth: number,
  targetHeight: number,
  focalXPct: number,
  focalYPct: number,
  filter: AlbumPhotoFilter | undefined,
  bakeInBw: boolean,
  extra?: { opacity?: number; blur?: number; zoom?: number }
): Promise<{ data: Buffer; width: number; height: number } | null> {
  try {
    let img = sharp(buffer).rotate();
    const meta = await img.metadata();
    if (!meta.width || !meta.height) return null;
    const imgAspect = meta.width / meta.height;
    const boxAspect = targetWidth / targetHeight;
    const drawW = imgAspect > boxAspect ? Math.round(targetHeight * imgAspect) : targetWidth;
    const drawH = imgAspect > boxAspect ? targetHeight : Math.round(targetWidth / imgAspect);
    img = img.resize(drawW, drawH);
    if (filter === "sepia") img = img.tint({ r: 112, g: 66, b: 20 });
    // Not .grayscale() — that collapses the pipeline to a single channel, and a later
    // .ensureAlpha().raw() then silently produces a 1-byte-per-pixel buffer instead of RGBA
    // (confirmed empirically: sharp reports hasAlpha:true in the metadata but the actual raw
    // channel count stays 1), which crashes sharp's composite() downstream expecting 4 channels.
    // Desaturating via modulate keeps the pipeline at 3 (then 4 with alpha) channels throughout.
    else if (filter === "bw" && bakeInBw) img = img.modulate({ saturation: 0 });
    if (extra?.blur) img = img.blur(Math.max(0.3, (extra.blur / 100) * ALBUM_BLUR_MAX_PX));
    const left = Math.min(Math.max(0, Math.round((drawW - targetWidth) * (focalXPct / 100))), Math.max(0, drawW - targetWidth));
    const top = Math.min(Math.max(0, Math.round((drawH - targetHeight) * (focalYPct / 100))), Math.max(0, drawH - targetHeight));
    let data = await img.extract({ left, top, width: targetWidth, height: targetHeight }).ensureAlpha().raw().toBuffer();

    if (extra?.zoom && extra.zoom !== 100) {
      // Mirrors the CSS `transform: scale()` on the <img> — zooms in from the CENTER of the
      // already focal-positioned cover-fit crop (not from the focal point itself), same as the
      // browser: crop a smaller center window and blow it back up to the full target size.
      const zf = extra.zoom / 100;
      const subW = Math.max(1, Math.round(targetWidth / zf));
      const subH = Math.max(1, Math.round(targetHeight / zf));
      const subLeft = Math.round((targetWidth - subW) / 2);
      const subTop = Math.round((targetHeight - subH) / 2);
      data = await sharp(data, { raw: { width: targetWidth, height: targetHeight, channels: 4 } })
        .extract({ left: subLeft, top: subTop, width: subW, height: subH })
        .resize(targetWidth, targetHeight)
        .ensureAlpha()
        .raw()
        .toBuffer();
    }

    if (extra?.opacity !== undefined && extra.opacity < 100) {
      // Scale the alpha channel directly — cheaper than another sharp pipeline pass, and
      // composite() already respects per-pixel alpha when blending onto the base canvas.
      const factor = Math.max(0, extra.opacity) / 100;
      for (let i = 3; i < data.length; i += 4) data[i] = Math.round(data[i] * factor);
    }

    return { data, width: targetWidth, height: targetHeight };
  } catch {
    return null;
  }
}

// Bakes the border stroke onto the cropped photo (so they become one flat tile) and, if rotated,
// spins that whole tile via sharp's own .rotate() with canvas expansion — no corner clipping, and
// the border/outline rotates together with the photo content as a single rigid rectangle, matching
// the CSS fix of putting `transform: rotate()` on the frame div rather than just the <img>. left/top
// are the offset to ADD to the frame's own unrotated (x,y) to place the (possibly now-larger) tile
// so it stays centered on the frame's original center.
async function composePhotoTile(
  buffer: Buffer,
  width: number,
  height: number,
  focalX: number,
  focalY: number,
  filter: AlbumPhotoFilter | undefined,
  bakeInBw: boolean,
  extra: { rotation?: number; opacity?: number; blur?: number; zoom?: number; borderWidth?: number; borderColor?: string }
): Promise<{ data: Buffer; width: number; height: number; left: number; top: number } | null> {
  const cropped = await coverCropRaw(buffer, width, height, focalX, focalY, filter, bakeInBw, { opacity: extra.opacity, blur: extra.blur, zoom: extra.zoom });
  if (!cropped) return null;
  let data = cropped.data;
  let w = width;
  let h = height;

  if (extra.borderWidth) {
    const strokeSvg = `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg"><rect x="${extra.borderWidth / 2}" y="${extra.borderWidth / 2}" width="${w - extra.borderWidth}" height="${h - extra.borderWidth}" fill="none" stroke="${extra.borderColor ?? "#ffffff"}" stroke-width="${extra.borderWidth}"/></svg>`;
    data = await sharp(data, { raw: { width: w, height: h, channels: 4 } })
      .composite([{ input: Buffer.from(strokeSvg) }])
      .ensureAlpha()
      .raw()
      .toBuffer();
  }

  let left = 0;
  let top = 0;
  if (extra.rotation) {
    const rotated = await sharp(data, { raw: { width: w, height: h, channels: 4 } })
      .rotate(extra.rotation, { background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    left = -(rotated.info.width - w) / 2;
    top = -(rotated.info.height - h) / 2;
    w = rotated.info.width;
    h = rotated.info.height;
    data = rotated.data;
  }
  return { data, width: w, height: h, left, top };
}

// A soft blurred rectangle sized/offset to sit behind a photo frame, mirroring the CSS box-shadow
// used in the builder/client preview (same offset/blur/alpha formula as boxShadowFor there) —
// composited BEFORE the photo itself so it reads as a shadow cast behind it. The canvas is padded
// on every side so the Gaussian blur has room to fall off without being clipped at its own edges.
// If rotationDeg is set, the shadow rect is spun the same amount (matching composePhotoTile) so it
// stays a rigid shadow of the tilted tile rather than a shadow of the frame's original axis-aligned
// bounds; sharp's composite() rejects negative left/top, so a frame near the page edge gets its
// shadow pre-cropped to the visible portion. frameX/frameY are the frame's own unrotated page-pixel
// top-left — placement is computed from the frame's CENTER so it lines up with composePhotoTile's
// (also center-based) rotated placement.
async function shadowLayerPng(
  width: number,
  height: number,
  shadowPct: number | undefined,
  frameX: number,
  frameY: number,
  rotationDeg?: number
): Promise<{ buffer: Buffer; left: number; top: number } | null> {
  if (!shadowPct) return null;
  const blurPx = Math.max(1, (shadowPct / 100) * 24);
  const offsetPx = Math.round((shadowPct / 100) * 10);
  const alpha = 0.15 + (shadowPct / 100) * 0.45;
  const pad = Math.ceil(blurPx * 3);
  let canvasW = width + pad * 2;
  let canvasH = height + pad * 2;
  const rectSvg = `<svg width="${canvasW}" height="${canvasH}" xmlns="http://www.w3.org/2000/svg"><rect x="${pad}" y="${pad}" width="${width}" height="${height}" fill="rgba(0,0,0,${alpha})"/></svg>`;
  let buffer = await sharp(Buffer.from(rectSvg)).blur(blurPx).png().toBuffer();

  if (rotationDeg) {
    const rotated = await sharp(buffer)
      .rotate(rotationDeg, { background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toBuffer({ resolveWithObject: true });
    buffer = rotated.data;
    canvasW = rotated.info.width;
    canvasH = rotated.info.height;
  }

  const centerX = frameX + width / 2;
  const centerY = frameY + height / 2;
  let left = Math.round(centerX + offsetPx - canvasW / 2);
  let top = Math.round(centerY + offsetPx - canvasH / 2);
  const cropLeft = Math.max(0, -left);
  const cropTop = Math.max(0, -top);
  if (cropLeft || cropTop) {
    const cropW = canvasW - cropLeft;
    const cropH = canvasH - cropTop;
    if (cropW <= 0 || cropH <= 0) return null;
    buffer = await sharp(buffer).extract({ left: cropLeft, top: cropTop, width: cropW, height: cropH }).png().toBuffer();
    left = Math.max(0, left);
    top = Math.max(0, top);
  }
  return { buffer, left, top };
}

export type PageInput = { spread: GalleryAlbumSpreadRow | null; isCover?: boolean };

export async function renderAlbumPageJpeg({
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
  const composites: OverlayOptions[] = [];

  if (isCover) {
    const photo = album.cover_photo_id ? photosById.get(album.cover_photo_id) : null;
    const buffer = photo ? await downloadObjectBuffer("galleries", photo.storage_path) : null;
    const cropped = buffer ? await coverCropRaw(buffer, pageWidthPx, pageHeightPx, 50, 50, undefined, false) : null;
    if (!cropped) return null;
    composites.push({ input: cropped.data, raw: { width: cropped.width, height: cropped.height, channels: 4 }, left: 0, top: 0 });
    const bandHeight = Math.round(pageHeightPx * 0.19);
    const band = await sharp({ create: { width: pageWidthPx, height: bandHeight, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0.45 } } }).png().toBuffer();
    composites.push({ input: band, left: 0, top: pageHeightPx - bandHeight });
    try {
      const titleSvg = await svgTextLayer(album.title, {
        xPx: 0,
        yPx: pageHeightPx - bandHeight * 0.62,
        widthPx: pageWidthPx,
        fontSizePx: Math.round(pageWidthPx * 0.032),
        color: "#ffffff",
        align: "center",
        pageWidthPx,
        pageHeightPx,
      });
      composites.push({ input: titleSvg, left: 0, top: 0 });
    } catch {
      // A broken title render shouldn't sink the whole cover photo.
    }
    return sharp({ create: { width: pageWidthPx, height: pageHeightPx, channels: 3, background: "#000000" } })
      .composite(composites)
      .jpeg({ quality: 92 })
      .toBuffer();
  }

  if (!spread) return null;

  if (spread.background_photo_id) {
    const bgPhoto = photosById.get(spread.background_photo_id);
    const bgBuffer = bgPhoto ? await downloadObjectBuffer("galleries", bgPhoto.storage_path) : null;
    const bgCropped = bgBuffer
      ? await coverCropRaw(bgBuffer, pageWidthPx, pageHeightPx, 50, 50, undefined, false, { blur: spread.background_blur, opacity: spread.background_opacity })
      : null;
    if (bgCropped) composites.push({ input: bgCropped.data, raw: { width: bgCropped.width, height: bgCropped.height, channels: 4 }, left: 0, top: 0 });
  }

  const elements = resolvePageElements(spread, pageWidthPx, pageHeightPx);
  let any = false;
  for (const el of elements) {
    if (el.kind === "text") {
      try {
        const svg = await svgTextLayer(el.text, {
          xPx: el.x,
          yPx: el.y,
          widthPx: el.width,
          fontSizePx: el.fontSizePx,
          color: el.color,
          align: el.align,
          pageWidthPx,
          pageHeightPx,
          fontFamily: el.fontFamily,
        });
        composites.push({ input: svg, left: 0, top: 0 });
      } catch {
        // A broken text-layer render shouldn't sink the rest of the page.
      }
      continue;
    }
    if (!el.photoId) continue;
    const photo = photosById.get(el.photoId);
    const buffer = photo ? await downloadObjectBuffer("galleries", photo.storage_path) : null;
    if (!buffer) continue;
    const width = Math.max(1, Math.round(el.width));
    const height = Math.max(1, Math.round(el.height));
    const frameX = Math.round(el.x);
    const frameY = Math.round(el.y);
    const tile = await composePhotoTile(buffer, width, height, el.focalX, el.focalY, el.filter, true, {
      rotation: el.rotation,
      opacity: el.opacity,
      blur: el.blur,
      zoom: el.zoom,
      borderWidth: el.borderWidth,
      borderColor: el.borderColor,
    });
    if (!tile) continue;
    any = true;
    const shadow = await shadowLayerPng(width, height, el.shadow, frameX, frameY, el.rotation);
    if (shadow) composites.push({ input: shadow.buffer, left: shadow.left, top: shadow.top });
    composites.push({ input: tile.data, raw: { width: tile.width, height: tile.height, channels: 4 }, left: Math.round(frameX + tile.left), top: Math.round(frameY + tile.top) });
  }
  if (!any && !elements.some((e) => e.kind === "text") && !spread.background_photo_id) return null;

  return sharp({ create: { width: pageWidthPx, height: pageHeightPx, channels: 3, background: "#ffffff" } })
    .composite(composites)
    .jpeg({ quality: 92 })
    .toBuffer();
}

export { resolvePageElements, coverCropRaw, composePhotoTile, svgTextLayer, shadowLayerPng };
