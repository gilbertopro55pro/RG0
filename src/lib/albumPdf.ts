import fs from "node:fs/promises";
import path from "node:path";
import {
  PDFDocument,
  PDFFont,
  PDFImage,
  PDFPage,
  rgb,
  pushGraphicsState,
  popGraphicsState,
  moveTo,
  lineTo,
  closePath,
  clip,
  endPath,
  concatTransformationMatrix,
} from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import sharp from "sharp";
import { downloadObjectBuffer } from "@/lib/storage";
import { drawAlignedBidiText, drawCenteredBidiText } from "@/lib/pdfText";
import { getAlbumFontFiles } from "@/lib/albumFontFiles";
import { ALBUM_BLUR_MAX_PX } from "@/lib/albumRaster";
import type { AlbumPhotoFilter, AlbumTextElement, GalleryAlbumRow, GalleryAlbumSpreadRow, GalleryPhotoRow } from "@/lib/types";

function hexToRgbTuple(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!m) return [1, 1, 1];
  return [parseInt(m[1], 16) / 255, parseInt(m[2], 16) / 255, parseInt(m[3], 16) / 255];
}

// Applied server-side via sharp before the buffer ever reaches pdf-lib — pdf-lib itself has no
// image color-transform primitive, so this is the only way the PDF's B&W/sepia frames actually
// match what the CSS `filter: grayscale()/sepia()` preview shows in the builder and proofing view.
async function applyPhotoFilter(buffer: Buffer, filter: AlbumPhotoFilter | undefined, blurPct?: number): Promise<Buffer> {
  if ((!filter || filter === "none") && !blurPct) return buffer;
  let img = sharp(buffer).rotate(); // .rotate() with no args auto-applies EXIF orientation first
  // Sepia = tinted — sharp's tint() already desaturates internally before recoloring, so this is
  // the standard sepia approximation. Chaining an explicit .grayscale() *before* .tint() looks
  // like the obvious way to write it, but empirically neutralizes the tint entirely (confirmed:
  // grayscale().tint() produces pure gray, R=G=B, while tint() alone produces the expected warm
  // tone) — so grayscale must never precede tint in this pipeline.
  if (filter === "sepia") img = img.tint({ r: 112, g: 66, b: 20 });
  else if (filter === "bw") img = img.grayscale();
  // pdf-lib has no blur primitive at all, so this is the only place a blurred photo can come from
  // for the PDF export — baked into the pixels before embedding, same as the filter above.
  if (blurPct) img = img.blur(Math.max(0.3, (blurPct / 100) * ALBUM_BLUR_MAX_PX));
  return img.jpeg({ quality: 90 }).toBuffer();
}

// One "spread" page in the exported PDF, in points — a landscape rectangle standing in for one
// printed album opening. Not tied to any specific print lab's trim/bleed spec (this app has no
// print vendor integration); it's a proof/layout export, not a certified press-ready file.
const PAGE_WIDTH = 1600;
const PAGE_HEIGHT = 1000;
const GAP = 8;

async function embedImageAuto(pdfDoc: PDFDocument, buffer: Buffer): Promise<PDFImage | null> {
  // pdf-lib's JPEG/PNG embedders don't respect a Buffer's byteOffset — they end up reading from
  // the start of its underlying (possibly pooled, possibly shared, possibly larger) ArrayBuffer
  // instead of the actual slice, silently misreading unrelated bytes as the image. Buffers coming
  // back from the S3 SDK's byte-array transform aren't guaranteed byteOffset 0, so copy into a
  // fresh, zero-offset Uint8Array before handing it to pdf-lib — confirmed via direct testing that
  // this is what actually fixes it (a same-length "identical" Buffer with a nonzero byteOffset
  // reliably fails with "SOI not found in JPEG" even though its bytes compare equal).
  const clean = new Uint8Array(buffer);
  const isPng = clean.length > 8 && clean[0] === 0x89 && clean[1] === 0x50 && clean[2] === 0x4e && clean[3] === 0x47;
  try {
    return isPng ? await pdfDoc.embedPng(clean) : await pdfDoc.embedJpg(clean);
  } catch {
    return null;
  }
}

// Places an image "cover-cropped" into a rect, clipped to that rect and aimed at the given focal
// point (0-100 on each axis) — the same crop math as the CSS `object-fit: cover` +
// `object-position` used in the builder and proofing views, so the PDF matches what was approved.
// `rotation` (degrees, CSS convention — positive is clockwise) rotates only the image content
// around the rect's own center while the clip stays a fixed, unrotated rectangle — exactly how
// the browser preview looks (a `transform: rotate()` on the `<img>` inside an `overflow-hidden`
// frame that itself never rotates).
function drawCoverImage(
  page: PDFPage,
  image: PDFImage,
  rect: { x: number; y: number; width: number; height: number },
  focalXPct: number,
  focalYPct: number,
  opts?: { rotation?: number; opacity?: number }
) {
  const { x, y, width: w, height: h } = rect;
  const imgAspect = image.width / image.height;
  const boxAspect = w / h;
  let drawW: number;
  let drawH: number;
  if (imgAspect > boxAspect) {
    drawH = h;
    drawW = h * imgAspect;
  } else {
    drawW = w;
    drawH = w / imgAspect;
  }
  const fx = focalXPct / 100;
  const fy = focalYPct / 100;
  const dx = x - (drawW - w) * fx;
  // PDF's y-axis runs bottom-up, while focalY follows the CSS convention (0 = top) — flip it.
  const dy = y - (drawH - h) * (1 - fy);

  const ops = [
    pushGraphicsState(),
    moveTo(x, y),
    lineTo(x + w, y),
    lineTo(x + w, y + h),
    lineTo(x, y + h),
    closePath(),
    clip(),
    endPath(),
  ];
  if (opts?.rotation) {
    const cx = x + w / 2;
    const cy = y + h / 2;
    // PDF's CTM rotation is counter-clockwise for a positive angle in its bottom-up y-axis space —
    // negating the CSS-convention degrees here makes a positive value turn clockwise on screen,
    // same as the CSS `rotate()` used everywhere else this value is applied.
    const rad = (-opts.rotation * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    ops.push(
      concatTransformationMatrix(1, 0, 0, 1, cx, cy),
      concatTransformationMatrix(cos, sin, -sin, cos, 0, 0),
      concatTransformationMatrix(1, 0, 0, 1, -cx, -cy)
    );
  }
  page.pushOperators(...ops);
  page.drawImage(image, { x: dx, y: dy, width: drawW, height: drawH, opacity: opts?.opacity });
  page.pushOperators(popGraphicsState());
}

// `el.fontSize` is already points on this exact 1600pt-wide reference canvas (see the
// AlbumFontSizePt comment in types.ts), so — unlike every other geometry field here — it needs no
// scaling at all; it *is* the PDFFont size.
// Drawn twice — a shadow pass offset by a couple points, then the real text on top — since pdf-lib
// has no text-shadow primitive and a flat color alone can vanish against a busy photo background.
function drawTextElement(
  page: PDFPage,
  el: AlbumTextElement,
  fonts: { hebrewFont: PDFFont; latinFont: PDFFont }
) {
  const boxX = (el.xPct / 100) * PAGE_WIDTH;
  const boxWidth = (el.widthPct / 100) * PAGE_WIDTH;
  const size = el.fontSize;
  const y = PAGE_HEIGHT - (el.yPct / 100) * PAGE_HEIGHT - size;
  const mainColor = el.color === "white" ? rgb(1, 1, 1) : rgb(0, 0, 0);
  const shadowColor = el.color === "white" ? rgb(0, 0, 0) : rgb(1, 1, 1);
  for (const [dx, dy, color] of [
    [2, -2, shadowColor],
    [0, 0, mainColor],
  ] as const) {
    drawAlignedBidiText(page, el.text, {
      boxX: boxX + dx,
      boxWidth,
      y: y + dy,
      size,
      align: el.align,
      color,
      ...fonts,
    });
  }
}

export async function generateAlbumPdf({
  album,
  spreads,
  photosById,
}: {
  album: GalleryAlbumRow;
  spreads: GalleryAlbumSpreadRow[];
  photosById: Map<string, Pick<GalleryPhotoRow, "id" | "storage_path">>;
}): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  pdfDoc.registerFontkit(fontkit);

  const fontsDir = path.join(process.cwd(), "src/assets/fonts");
  const [hebrewFont, latinFont] = await Promise.all([
    pdfDoc.embedFont(await fs.readFile(path.join(fontsDir, "Heebo-Hebrew-Bold.ttf"))),
    pdfDoc.embedFont(await fs.readFile(path.join(fontsDir, "Heebo-Latin-Bold.ttf"))),
  ]);
  const defaultFonts = { hebrewFont, latinFont };

  // Fonts are embedded lazily, one pair per distinct selection actually used in this album — a
  // full 20-family embed on every export would bloat every single PDF regardless of use.
  const fontPairCache = new Map<string, { hebrewFont: PDFFont; latinFont: PDFFont }>();
  const getFontsForFamily = async (fontFamily: string | undefined): Promise<{ hebrewFont: PDFFont; latinFont: PDFFont }> => {
    const key = fontFamily ?? "heebo";
    if (key === "heebo") return defaultFonts;
    const cached = fontPairCache.get(key);
    if (cached) return cached;
    const { hebrewFile, latinFile } = getAlbumFontFiles(key);
    const pair = {
      hebrewFont: hebrewFile === "Heebo-Hebrew-Bold.ttf" ? hebrewFont : await pdfDoc.embedFont(await fs.readFile(path.join(fontsDir, hebrewFile))),
      latinFont: latinFile === "Heebo-Latin-Bold.ttf" ? latinFont : await pdfDoc.embedFont(await fs.readFile(path.join(fontsDir, latinFile))),
    };
    fontPairCache.set(key, pair);
    return pair;
  };

  const imageCache = new Map<string, PDFImage | null>();
  const embedByPhotoId = async (photoId: string | null, filter?: AlbumPhotoFilter, blurPct?: number): Promise<PDFImage | null> => {
    if (!photoId) return null;
    const cacheKey = `${photoId}:${filter ?? "none"}:${blurPct ?? 0}`;
    if (imageCache.has(cacheKey)) return imageCache.get(cacheKey)!;
    const photo = photosById.get(photoId);
    let buffer = photo ? await downloadObjectBuffer("galleries", photo.storage_path) : null;
    if (buffer && ((filter && filter !== "none") || blurPct)) {
      try {
        buffer = await applyPhotoFilter(buffer, filter, blurPct);
      } catch {
        // Fall back to the unfiltered image rather than dropping it entirely.
      }
    }
    const image = buffer ? await embedImageAuto(pdfDoc, buffer) : null;
    imageCache.set(cacheKey, image);
    return image;
  };

  if (album.cover_photo_id) {
    const coverImage = await embedByPhotoId(album.cover_photo_id);
    if (coverImage) {
      const page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
      drawCoverImage(page, coverImage, { x: 0, y: 0, width: PAGE_WIDTH, height: PAGE_HEIGHT }, 50, 50);
      page.drawRectangle({ x: 0, y: 0, width: PAGE_WIDTH, height: 190, color: rgb(0, 0, 0), opacity: 0.45 });
      drawCenteredBidiText(page, album.title, {
        centerX: PAGE_WIDTH / 2,
        y: 75,
        size: 52,
        hebrewFont,
        latinFont,
        color: rgb(1, 1, 1),
      });
    }
  }

  for (const spread of spreads) {
    if (spread.layout === "custom") {
      // A free-form page can be text-only (no photo elements at all) — unlike the preset
      // layouts, it always gets a page even if every photo element fails to embed.
      const page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
      if (spread.background_photo_id) {
        const bgImage = await embedByPhotoId(spread.background_photo_id, undefined, spread.background_blur);
        if (bgImage) drawCoverImage(page, bgImage, { x: 0, y: 0, width: PAGE_WIDTH, height: PAGE_HEIGHT }, 50, 50, { opacity: spread.background_opacity / 100 });
      }
      for (const el of spread.elements) {
        if (el.type === "text") {
          drawTextElement(page, el, await getFontsForFamily(el.fontFamily));
          continue;
        }
        const image = await embedByPhotoId(el.photoId, el.filter, el.blur);
        if (!image) continue;
        const width = (el.widthPct / 100) * PAGE_WIDTH;
        const height = (el.heightPct / 100) * PAGE_HEIGHT;
        const x = (el.xPct / 100) * PAGE_WIDTH;
        const y = PAGE_HEIGHT - (el.yPct / 100) * PAGE_HEIGHT - height;
        drawCoverImage(page, image, { x, y, width, height }, el.focalX, el.focalY, { rotation: el.rotation, opacity: el.opacity !== undefined ? el.opacity / 100 : undefined });
        if (el.borderWidth) {
          page.drawRectangle({
            x,
            y,
            width,
            height,
            borderWidth: el.borderWidth,
            borderColor: rgb(...hexToRgbTuple(el.borderColor ?? "#ffffff")),
          });
        }
      }
      continue;
    }

    const image1 = await embedByPhotoId(spread.photo_id_1);
    if (!image1) continue;
    const image2 = await embedByPhotoId(spread.photo_id_2);

    const page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);

    if (spread.background_photo_id) {
      const bgImage = await embedByPhotoId(spread.background_photo_id, undefined, spread.background_blur);
      if (bgImage) drawCoverImage(page, bgImage, { x: 0, y: 0, width: PAGE_WIDTH, height: PAGE_HEIGHT }, 50, 50, { opacity: spread.background_opacity / 100 });
    }

    if (!image2) {
      drawCoverImage(page, image1, { x: 0, y: 0, width: PAGE_WIDTH, height: PAGE_HEIGHT }, spread.focal_x_1, spread.focal_y_1);
    } else if (spread.layout === "stack") {
      const halfH = (PAGE_HEIGHT - GAP) / 2;
      // Vertical stacking order is unaffected by RTL (dir only reorders the inline/horizontal
      // axis) — photo1 on top, photo2 below, same as the app's flex-col rendering.
      drawCoverImage(page, image1, { x: 0, y: halfH + GAP, width: PAGE_WIDTH, height: halfH }, spread.focal_x_1, spread.focal_y_1);
      drawCoverImage(page, image2, { x: 0, y: 0, width: PAGE_WIDTH, height: halfH }, spread.focal_x_2, spread.focal_y_2);
    } else {
      const ratio1 = spread.layout === "feature" ? 1.6 : 1;
      const width1 = ((PAGE_WIDTH - GAP) * ratio1) / (ratio1 + 1);
      const width2 = PAGE_WIDTH - GAP - width1;
      // The app's UI is RTL (photo1 is the first flex child, so it renders on the *right*) —
      // mirrored here so the exported PDF matches what was actually reviewed and approved.
      drawCoverImage(page, image2, { x: 0, y: 0, width: width2, height: PAGE_HEIGHT }, spread.focal_x_2, spread.focal_y_2);
      drawCoverImage(page, image1, { x: width2 + GAP, y: 0, width: width1, height: PAGE_HEIGHT }, spread.focal_x_1, spread.focal_y_1);
    }

    for (const el of spread.elements) {
      if (el.type === "text") drawTextElement(page, el, await getFontsForFamily(el.fontFamily));
    }
  }

  return pdfDoc.save();
}
