import fs from "node:fs/promises";
import path from "node:path";
import {
  PDFDocument,
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
} from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { downloadObjectBuffer } from "@/lib/storage";
import { drawCenteredBidiText } from "@/lib/pdfText";
import type { GalleryAlbumRow, GalleryAlbumSpreadRow, GalleryPhotoRow } from "@/lib/types";

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
function drawCoverImage(
  page: PDFPage,
  image: PDFImage,
  rect: { x: number; y: number; width: number; height: number },
  focalXPct: number,
  focalYPct: number
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

  page.pushOperators(
    pushGraphicsState(),
    moveTo(x, y),
    lineTo(x + w, y),
    lineTo(x + w, y + h),
    lineTo(x, y + h),
    closePath(),
    clip(),
    endPath()
  );
  page.drawImage(image, { x: dx, y: dy, width: drawW, height: drawH });
  page.pushOperators(popGraphicsState());
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

  const imageCache = new Map<string, PDFImage | null>();
  const embedByPhotoId = async (photoId: string | null): Promise<PDFImage | null> => {
    if (!photoId) return null;
    if (imageCache.has(photoId)) return imageCache.get(photoId)!;
    const photo = photosById.get(photoId);
    const buffer = photo ? await downloadObjectBuffer("galleries", photo.storage_path) : null;
    const image = buffer ? await embedImageAuto(pdfDoc, buffer) : null;
    imageCache.set(photoId, image);
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
    const image1 = await embedByPhotoId(spread.photo_id_1);
    if (!image1) continue;
    const image2 = await embedByPhotoId(spread.photo_id_2);

    const page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);

    if (!image2) {
      drawCoverImage(page, image1, { x: 0, y: 0, width: PAGE_WIDTH, height: PAGE_HEIGHT }, spread.focal_x_1, spread.focal_y_1);
      continue;
    }

    if (spread.layout === "stack") {
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
  }

  return pdfDoc.save();
}
