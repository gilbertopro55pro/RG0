import fs from "node:fs/promises";
import path from "node:path";
import { PDFDocument, PDFImage, rgb, type RGB } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { drawAlignedBidiText, drawCenteredBidiText } from "@/lib/pdfText";
import type { Photographer, PriceQuoteItem } from "@/lib/types";

// A4 portrait, in points (72pt/inch) — a business document, unlike the album export's fixed
// landscape spread size, so this gets its own page-size constant rather than reusing albumPdf's.
const PAGE_WIDTH = 595;
const PAGE_HEIGHT = 842;
const MARGIN = 48;

const INK = rgb(0.125, 0.122, 0.2); // --color-ink
const INK_SOFT = rgb(0.373, 0.365, 0.486); // --color-ink-soft
const LINE = rgb(0.906, 0.89, 0.953); // --color-line
const AMBER_DEEP = rgb(0.29, 0.373, 0.851); // --color-amber-deep

// "ש״ח" instead of the ₪ symbol used everywhere else in the app — this embedded Heebo font subset
// has no glyph for ₪ at all (confirmed by rendering it: comes out as a missing-glyph box), while
// the Hebrew abbreviation renders correctly since it's just ordinary Hebrew letters/punctuation.
function currency(n: number): string {
  return `${n.toLocaleString("he-IL", { minimumFractionDigits: 0, maximumFractionDigits: 2 })} ש״ח`;
}

function formatDateDMY(d: Date): string {
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}.${mm}.${d.getFullYear()}`;
}

// pdf-lib's JPEG/PNG embedders misread a Buffer whose byteOffset into its underlying ArrayBuffer
// isn't 0 (the S3 SDK's byte-array transform doesn't guarantee that) — same fix as albumPdf.ts's
// embedImageAuto, duplicated here rather than shared since these are two independent, differently
// laid-out documents with no other code in common.
async function embedImageAuto(pdfDoc: PDFDocument, buffer: Buffer): Promise<PDFImage | null> {
  const clean = new Uint8Array(buffer);
  const isPng = clean.length > 8 && clean[0] === 0x89 && clean[1] === 0x50 && clean[2] === 0x4e && clean[3] === 0x47;
  try {
    return isPng ? await pdfDoc.embedPng(clean) : await pdfDoc.embedJpg(clean);
  } catch {
    return null;
  }
}

export async function buildPriceQuotePdf(params: {
  photographer: Pick<Photographer, "name" | "phone" | "email" | "business_id">;
  logoBuffer: Buffer | null;
  clientName: string;
  items: PriceQuoteItem[];
  subtotal: number;
  vatAmount: number;
  total: number;
  createdAt: Date;
  // false for a VAT-exempt photographer (עוסק פטור) — collapses the cost summary to a single
  // "total" line instead of the usual subtotal/VAT/total breakdown.
  showVat?: boolean;
  // Optional event context (from the calculator's quote-builder flow, or the manual builder's own
  // event fields) — omitted entirely for a quote with none of this filled in.
  eventDetails?: { type?: string; date?: string; location?: string; workHours?: string };
}): Promise<Uint8Array> {
  const { photographer, logoBuffer, clientName, items, subtotal, vatAmount, total, createdAt, showVat = true, eventDetails } = params;

  const pdfDoc = await PDFDocument.create();
  pdfDoc.registerFontkit(fontkit);

  const fontsDir = path.join(process.cwd(), "src/assets/fonts");
  const [hebrewBold, latinBold, hebrewRegular, latinRegular] = await Promise.all([
    pdfDoc.embedFont(await fs.readFile(path.join(fontsDir, "Heebo-Hebrew-Bold.ttf"))),
    pdfDoc.embedFont(await fs.readFile(path.join(fontsDir, "Heebo-Latin-Bold.ttf"))),
    pdfDoc.embedFont(await fs.readFile(path.join(fontsDir, "Heebo-Hebrew-Regular.ttf"))),
    pdfDoc.embedFont(await fs.readFile(path.join(fontsDir, "Heebo-Latin-Regular.ttf"))),
  ]);
  const bold = { hebrewFont: hebrewBold, latinFont: latinBold };
  const regular = { hebrewFont: hebrewRegular, latinFont: latinRegular };

  const logo = logoBuffer ? await embedImageAuto(pdfDoc, logoBuffer) : null;

  let page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  let y = PAGE_HEIGHT - MARGIN;

  // Quote creation date, top-left corner — independent of the centered logo/title block below it.
  drawAlignedBidiText(page, formatDateDMY(createdAt), {
    boxX: MARGIN,
    boxWidth: PAGE_WIDTH - MARGIN * 2,
    y: y - 10,
    size: 10,
    align: "left",
    color: INK_SOFT,
    ...regular,
  });

  // Logo, centered, above the title — sized to fit within 128x128 CSS px (converted to points at
  // 96dpi) while keeping its own aspect ratio, not forced square. Kept small enough that a typical
  // quote still fits on one page.
  const LOGO_MAX_PT = (128 / 96) * 72;
  if (logo) {
    const scale = Math.min(LOGO_MAX_PT / logo.width, LOGO_MAX_PT / logo.height, 1);
    const logoWidth = logo.width * scale;
    const logoHeight = logo.height * scale;
    page.drawImage(logo, { x: (PAGE_WIDTH - logoWidth) / 2, y: y - logoHeight, width: logoWidth, height: logoHeight });
    y -= logoHeight + 18;
  }

  drawCenteredBidiText(page, "הצעת מחיר", { centerX: PAGE_WIDTH / 2, y: y - 24, size: 26, color: INK, ...bold });
  y -= 48;

  const bodyBoxX = MARGIN;
  const bodyBoxWidth = PAGE_WIDTH - MARGIN * 2;
  const lineHeight = 16;
  const drawLine = (text: string, size: number, font: typeof regular, color: RGB) => {
    drawAlignedBidiText(page, text, { boxX: bodyBoxX, boxWidth: bodyBoxWidth, y, size, align: "right", color, ...font });
    y -= lineHeight;
  };

  drawLine(photographer.name, 12, bold, INK);
  if (photographer.business_id?.trim()) drawLine(`ח.פ: ${photographer.business_id.trim()}`, 10, regular, INK_SOFT);
  drawLine(photographer.email, 10, regular, INK_SOFT);
  drawLine(photographer.phone, 10, regular, INK_SOFT);
  y -= 8;

  drawAlignedBidiText(page, `לכבוד: ${clientName || "לקוח/ה"}`, {
    boxX: bodyBoxX,
    boxWidth: bodyBoxWidth,
    y,
    size: 11,
    align: "right",
    color: INK,
    ...bold,
  });
  y -= lineHeight + 2;

  if (eventDetails?.type?.trim()) drawLine(`סוג האירוע: ${eventDetails.type.trim()}`, 9.5, regular, INK_SOFT);
  if (eventDetails?.date?.trim()) drawLine(`תאריך: ${eventDetails.date.trim()}`, 9.5, regular, INK_SOFT);
  if (eventDetails?.location?.trim()) drawLine(`מיקום האירוע: ${eventDetails.location.trim()}`, 9.5, regular, INK_SOFT);
  if (eventDetails?.workHours?.trim()) drawLine(`שעות העבודה: ${eventDetails.workHours.trim()}`, 9.5, regular, INK_SOFT);
  y -= 10;

  // Item table: right-to-left column order (פריט rightmost, since this is an RTL document) —
  // פריט 32%, פרטים 46%, מחיר 22%.
  const tableWidth = PAGE_WIDTH - MARGIN * 2;
  const colItemW = tableWidth * 0.32;
  const colDetailsW = tableWidth * 0.46;
  const colPriceW = tableWidth * 0.22;
  const colItemX = MARGIN + colDetailsW + colPriceW;
  const colDetailsX = MARGIN + colPriceW;
  const colPriceX = MARGIN;

  const headerY = y;
  page.drawRectangle({ x: MARGIN, y: headerY - 22, width: tableWidth, height: 22, color: rgb(0.969, 0.965, 0.953) });
  const headerTextY = headerY - 15.5;
  drawAlignedBidiText(page, "פריט", { boxX: colItemX, boxWidth: colItemW, y: headerTextY, size: 9.5, align: "right", color: INK_SOFT, ...bold });
  drawAlignedBidiText(page, "פרטים", { boxX: colDetailsX, boxWidth: colDetailsW, y: headerTextY, size: 9.5, align: "right", color: INK_SOFT, ...bold });
  drawAlignedBidiText(page, "מחיר", { boxX: colPriceX, boxWidth: colPriceW, y: headerTextY, size: 9.5, align: "right", color: INK_SOFT, ...bold });
  y = headerY - 22;

  const ROW_MIN_HEIGHT = 26;
  const WRAP_SIZE = 9.5;
  const wrapLines = (text: string, boxWidth: number, font: typeof regular.hebrewFont): string[] => {
    // Whole-string width estimate per line via the Hebrew font metrics (good enough for wrapping
    // purposes even for mixed Latin runs — this only decides where to break, not how to draw).
    const words = text.split(/\s+/).filter(Boolean);
    if (words.length === 0) return [""];
    const lines: string[] = [];
    let current = "";
    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, WRAP_SIZE) > boxWidth - 8 && current) {
        lines.push(current);
        current = word;
      } else {
        current = candidate;
      }
    }
    if (current) lines.push(current);
    return lines;
  };

  // The calculator auto-adds a "צילום אירוע" (event shoot) row summarizing the hours/rate — that's
  // now redundant with the "סוג האירוע"/"שעות העבודה" lines already shown above, so it's dropped
  // from the printed table. Its price still counts toward subtotal/total (those come in already
  // computed from the full item list, not derived from what's rendered here).
  const displayItems = items.filter((row) => row.item.trim() !== "צילום אירוע");

  for (const row of displayItems) {
    const detailLines = wrapLines(row.details, colDetailsW, hebrewRegular);
    const rowHeight = Math.max(ROW_MIN_HEIGHT, detailLines.length * 13 + 12);

    if (y - rowHeight < 170) {
      page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
      y = PAGE_HEIGHT - MARGIN;
    }

    const rowTopY = y;
    let lineY = rowTopY - 16;
    drawAlignedBidiText(page, row.item, { boxX: colItemX, boxWidth: colItemW, y: lineY, size: WRAP_SIZE, align: "right", color: INK, ...regular });
    detailLines.forEach((line, i) => {
      drawAlignedBidiText(page, line, { boxX: colDetailsX, boxWidth: colDetailsW, y: rowTopY - 16 - i * 13, size: WRAP_SIZE, align: "right", color: INK_SOFT, ...regular });
    });
    drawAlignedBidiText(page, currency(row.price), { boxX: colPriceX, boxWidth: colPriceW, y: lineY, size: WRAP_SIZE, align: "right", color: INK, ...regular });

    y = rowTopY - rowHeight;
    page.drawLine({ start: { x: MARGIN, y }, end: { x: MARGIN + tableWidth, y }, thickness: 0.75, color: LINE });
  }

  y -= 20;

  // Cost summary box, bottom-left of the item table per spec — a small 3-row breakdown, not a
  // full-width element, so it sits within roughly the left half of the page. Each row is now a
  // single "label:  value" line (rather than two independently-positioned boxes) so the colon and
  // spacing are literal characters in one bidi-laid-out string — matches the exact format
  // requested, gershayim (״, U+05F4) rather than a plain ASCII quote for the abbreviations.
  const boxWidth = tableWidth * 0.52;
  const boxX = MARGIN;
  const rows: [string, boolean][] = showVat
    ? [
        [`סה״כ לא כולל מע״מ:  ${currency(subtotal)}`, false],
        [`מע״מ:  ${currency(vatAmount)}`, false],
        [`סה״כ כולל מע״מ:  ${currency(total)}`, true],
      ]
    : [[`סה״כ לתשלום (עוסק פטור):  ${currency(total)}`, true]];
  let boxY = y;
  rows.forEach(([text, emphasize], i) => {
    if (emphasize) {
      page.drawLine({ start: { x: boxX, y: boxY + 4 }, end: { x: boxX + boxWidth, y: boxY + 4 }, thickness: 1, color: AMBER_DEEP });
    }
    const font = emphasize ? bold : regular;
    drawAlignedBidiText(page, text, { boxX, boxWidth, y: boxY - 11, size: emphasize ? 12 : 10, align: "right", color: emphasize ? AMBER_DEEP : INK_SOFT, ...font });
    boxY -= emphasize ? 24 : 20;
  });

  return pdfDoc.save();
}
