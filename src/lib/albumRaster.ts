import fs from "node:fs/promises";
import path from "node:path";
import sharp, { type OverlayOptions } from "sharp";
import { downloadObjectBuffer } from "@/lib/storage";
import type { AlbumElement, AlbumPhotoFilter, GalleryAlbumRow, GalleryAlbumSpreadRow, GalleryPhotoRow } from "@/lib/types";

const DPI = 300;

export function pxFromCm(cm: number): number {
  return Math.max(200, Math.round((cm / 2.54) * DPI));
}

let fontCache: { hebrew: string; latin: string } | null = null;
async function loadFontsBase64(): Promise<{ hebrew: string; latin: string }> {
  if (fontCache) return fontCache;
  const fontsDir = path.join(process.cwd(), "src/assets/fonts");
  const [hebrew, latin] = await Promise.all([
    fs.readFile(path.join(fontsDir, "Heebo-Hebrew-Bold.ttf")),
    fs.readFile(path.join(fontsDir, "Heebo-Latin-Bold.ttf")),
  ]);
  fontCache = { hebrew: hebrew.toString("base64"), latin: latin.toString("base64") };
  return fontCache;
}

function escapeXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// One SVG (with the real Heebo files embedded as @font-face data URIs, split by unicode-range so
// Hebrew and Latin/digit runs each pick the right glyphs automatically) rendered by sharp/librsvg
// — its Pango/HarfBuzz text shaping correctly reorders mixed-direction Hebrew+Latin glyphs via
// `direction="rtl"`. BUT text-anchor="start"/"end" combined with direction="rtl" on a mixed-script
// run is buggy in this renderer (confirmed empirically): the computed anchor offset is wrong and
// can place most or all of the text off-canvas. text-anchor="middle" renders correctly regardless
// of script mix, so every alignment funnels through it — for "left"/"right" we render once at a
// throwaway centerX purely to measure the ink's actual width via sharp's trim(), then render again
// at the centerX that produces the desired visual edge.
function buildTextSvg(text: string, fonts: { hebrew: string; latin: string }, centerX: number, yPx: number, fontSizePx: number, color: string, pageWidthPx: number, pageHeightPx: number): Buffer {
  const svg = `<svg width="${pageWidthPx}" height="${pageHeightPx}" xmlns="http://www.w3.org/2000/svg">
<defs><style>
@font-face { font-family: 'AF'; src: url(data:font/ttf;base64,${fonts.hebrew}) format('truetype'); unicode-range: U+0590-05FF; }
@font-face { font-family: 'AF'; src: url(data:font/ttf;base64,${fonts.latin}) format('truetype'); }
</style></defs>
<text x="${centerX}" y="${yPx + fontSizePx}" font-family="AF" font-weight="700" font-size="${fontSizePx}" fill="${color}" text-anchor="middle" direction="rtl">${escapeXml(text)}</text>
</svg>`;
  return Buffer.from(svg);
}

async function svgTextLayer(
  text: string,
  opts: { xPx: number; yPx: number; widthPx: number; fontSizePx: number; color: string; align: "right" | "center" | "left"; pageWidthPx: number; pageHeightPx: number }
): Promise<Buffer> {
  const fonts = await loadFontsBase64();

  let centerX = opts.xPx + opts.widthPx / 2;
  if (opts.align !== "center") {
    const measureSvg = buildTextSvg(text, fonts, opts.pageWidthPx / 2, opts.yPx, opts.fontSizePx, opts.color, opts.pageWidthPx, opts.pageHeightPx);
    const { info } = await sharp(measureSvg).png().trim().toBuffer({ resolveWithObject: true });
    const inkWidth = info.width;
    centerX = opts.align === "right" ? opts.xPx + opts.widthPx - inkWidth / 2 : opts.xPx + inkWidth / 2;
  }

  const finalSvg = buildTextSvg(text, fonts, centerX, opts.yPx, opts.fontSizePx, opts.color, opts.pageWidthPx, opts.pageHeightPx);
  return sharp(finalSvg).png().toBuffer();
}

type ResolvedPhoto = { kind: "photo"; photoId: string | null; x: number; y: number; width: number; height: number; focalX: number; focalY: number; filter?: AlbumPhotoFilter; borderWidth?: number; borderColor?: string };
type ResolvedText = { kind: "text"; text: string; x: number; y: number; width: number; fontSizePx: number; color: "white" | "black"; align: "right" | "center" | "left" };
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
      fontSizePx: (el.fontSize / 100) * pageWidthPx,
      color: el.color,
      align: el.align,
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
// an independent layer (PSD), so it stays filter-agnostic about the destination.
async function coverCropRaw(
  buffer: Buffer,
  targetWidth: number,
  targetHeight: number,
  focalXPct: number,
  focalYPct: number,
  filter: AlbumPhotoFilter | undefined,
  bakeInBw: boolean
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
    const left = Math.min(Math.max(0, Math.round((drawW - targetWidth) * (focalXPct / 100))), Math.max(0, drawW - targetWidth));
    const top = Math.min(Math.max(0, Math.round((drawH - targetHeight) * (focalYPct / 100))), Math.max(0, drawH - targetHeight));
    const data = await img.extract({ left, top, width: targetWidth, height: targetHeight }).ensureAlpha().raw().toBuffer();
    return { data, width: targetWidth, height: targetHeight };
  } catch {
    return null;
  }
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
    return sharp({ create: { width: pageWidthPx, height: pageHeightPx, channels: 3, background: "#000000" } })
      .composite(composites)
      .jpeg({ quality: 92 })
      .toBuffer();
  }

  if (!spread) return null;
  const elements = resolvePageElements(spread, pageWidthPx, pageHeightPx);
  let any = false;
  for (const el of elements) {
    if (el.kind === "text") {
      const svg = await svgTextLayer(el.text, { xPx: el.x, yPx: el.y, widthPx: el.width, fontSizePx: el.fontSizePx, color: el.color === "white" ? "#ffffff" : "#000000", align: el.align, pageWidthPx, pageHeightPx });
      composites.push({ input: svg, left: 0, top: 0 });
      continue;
    }
    if (!el.photoId) continue;
    const photo = photosById.get(el.photoId);
    const buffer = photo ? await downloadObjectBuffer("galleries", photo.storage_path) : null;
    if (!buffer) continue;
    const width = Math.max(1, Math.round(el.width));
    const height = Math.max(1, Math.round(el.height));
    const cropped = await coverCropRaw(buffer, width, height, el.focalX, el.focalY, el.filter, true);
    if (!cropped) continue;
    any = true;
    composites.push({ input: cropped.data, raw: { width: cropped.width, height: cropped.height, channels: 4 }, left: Math.round(el.x), top: Math.round(el.y) });
    if (el.borderWidth) {
      const strokeSvg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg"><rect x="${el.borderWidth / 2}" y="${el.borderWidth / 2}" width="${width - el.borderWidth}" height="${height - el.borderWidth}" fill="none" stroke="${el.borderColor ?? "#ffffff"}" stroke-width="${el.borderWidth}"/></svg>`;
      composites.push({ input: Buffer.from(strokeSvg), left: Math.round(el.x), top: Math.round(el.y) });
    }
  }
  if (!any && !elements.some((e) => e.kind === "text")) return null;

  return sharp({ create: { width: pageWidthPx, height: pageHeightPx, channels: 3, background: "#ffffff" } })
    .composite(composites)
    .jpeg({ quality: 92 })
    .toBuffer();
}

export { resolvePageElements, coverCropRaw, svgTextLayer };
