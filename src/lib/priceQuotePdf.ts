import fs from "node:fs/promises";
import path from "node:path";
import { PDFDocument, PDFImage, PDFPage, rgb, type RGB } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { drawAlignedBidiText } from "@/lib/pdfText";
import type { Photographer, PriceQuoteItem } from "@/lib/types";
import { notificationEmailFor } from "@/lib/notificationEmail";

// A4 portrait, in points (72pt/inch) — a business document, unlike the album export's fixed
// landscape spread size, so this gets its own page-size constant rather than reusing albumPdf's.
const PAGE_WIDTH = 595;
const PAGE_HEIGHT = 842;
const MARGIN = 40;

// Invoice-style layout (owner's reference, 2026-09-28: a Finbot tax invoice): a navy header block
// with the business details, navy section bars, light cells for the table, and a navy total box.
const NAVY = rgb(0.122, 0.302, 0.475);
const NAVY_TINT = rgb(0.886, 0.914, 0.945);
const ACCENT = rgb(0.18, 0.8, 0.62);
const CELL = rgb(0.933, 0.933, 0.933);
const INK = rgb(0.13, 0.13, 0.15);
const INK_SOFT = rgb(0.38, 0.38, 0.42);
const WHITE = rgb(1, 1, 1);
const WHITE_SOFT = rgb(0.85, 0.9, 0.95);

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

// A rounded rectangle given by its TOP edge (pdf-lib's own rectangles have no corner radius).
// drawSvgPath's y axis points down from the origin, so the path is drawn from (x, top).
function roundedRect(page: PDFPage, x: number, top: number, width: number, height: number, radius: number, color: RGB) {
  const r = Math.min(radius, width / 2, height / 2);
  const d = `M ${r} 0 H ${width - r} Q ${width} 0 ${width} ${r} V ${height - r} Q ${width} ${height} ${width - r} ${height} H ${r} Q 0 ${height} 0 ${height - r} V ${r} Q 0 0 ${r} 0 Z`;
  page.drawSvgPath(d, { x, y: top, color, borderWidth: 0 });
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
  // Free-text notes/comments on the quote itself (not any one line item) — printed as its own
  // wrapped block after the cost summary. Omitted entirely when blank.
  notes?: string;
}): Promise<Uint8Array> {
  const { photographer, logoBuffer, clientName, items, subtotal, vatAmount, total, createdAt, showVat = true, eventDetails, notes } = params;

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
  type Font = typeof regular;

  const logo = logoBuffer ? await embedImageAuto(pdfDoc, logoBuffer) : null;

  let page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  const contentWidth = PAGE_WIDTH - MARGIN * 2;
  const text = (t: string, opts: { x: number; width: number; y: number; size: number; font: Font; color: RGB; align?: "left" | "center" | "right" }) =>
    drawAlignedBidiText(page, t, { boxX: opts.x, boxWidth: opts.width, y: opts.y, size: opts.size, align: opts.align ?? "right", color: opts.color, ...opts.font });

  // ── Header: navy block from the top-right corner, rounded bottom-left corner, green accent
  // peeking out beneath that corner. Business details and the document title sit inside it.
  const headerWidth = PAGE_WIDTH * 0.62;
  const headerX = PAGE_WIDTH - headerWidth;
  const headerLines: [string, number, Font, RGB][] = [[photographer.name, 14, bold, WHITE]];
  const businessLabel = showVat ? "עוסק מורשה" : "עוסק פטור";
  if (photographer.business_id?.trim()) headerLines.push([`${businessLabel} ${photographer.business_id.trim()}`, 9.5, regular, WHITE_SOFT]);
  // The address a client sees on the quote must be one that actually receives mail.
  if (photographer.phone?.trim()) headerLines.push([`טלפון: ${photographer.phone.trim()}`, 9.5, regular, WHITE_SOFT]);
  headerLines.push([notificationEmailFor(photographer.email), 9.5, regular, WHITE_SOFT]);
  const headerHeight = 34 + headerLines.length * 15 + 44;
  const cornerRadius = 26;
  const accentPath = (dy: number) =>
    `M 0 0 H ${headerWidth} V ${headerHeight + dy} H ${cornerRadius} Q 0 ${headerHeight + dy} 0 ${headerHeight + dy - cornerRadius} Z`;
  page.drawSvgPath(accentPath(5), { x: headerX, y: PAGE_HEIGHT, color: ACCENT, borderWidth: 0 });
  page.drawSvgPath(accentPath(0), { x: headerX, y: PAGE_HEIGHT, color: NAVY, borderWidth: 0 });

  const headerTextX = headerX + 24;
  const headerTextWidth = headerWidth - 24 - MARGIN;
  let hy = PAGE_HEIGHT - 34;
  headerLines.forEach(([t, size, font, color], i) => {
    text(t, { x: headerTextX, width: headerTextWidth, y: hy, size, font, color });
    hy -= i === 0 ? 17 : 14;
  });
  hy -= 4;
  page.drawLine({ start: { x: headerTextX, y: hy }, end: { x: headerTextX + headerTextWidth, y: hy }, thickness: 0.75, color: WHITE_SOFT });
  text("הצעת מחיר", { x: headerTextX, width: headerTextWidth, y: hy - 24, size: 19, font: bold, color: WHITE });

  // Logo, in the free space left of the header, kept to its own aspect ratio.
  if (logo) {
    const maxW = headerX - MARGIN - 20;
    const maxH = headerHeight - 30;
    const scale = Math.min(maxW / logo.width, maxH / logo.height, 1);
    const w = logo.width * scale;
    const h = logo.height * scale;
    page.drawImage(logo, { x: MARGIN + (maxW - w) / 2, y: PAGE_HEIGHT - 15 - (maxH + h) / 2, width: w, height: h });
  }

  // ── Recipient and date.
  let y = PAGE_HEIGHT - headerHeight - 30;
  text(`לכבוד: ${clientName || "לקוח/ה"}`, { x: MARGIN, width: contentWidth, y, size: 11.5, font: bold, color: INK });
  text(formatDateDMY(createdAt), { x: MARGIN, width: contentWidth, y, size: 10, font: regular, color: INK_SOFT, align: "left" });
  y -= 18;

  const sectionBar = (title: string) => {
    page.drawRectangle({ x: MARGIN, y: y - 24, width: contentWidth, height: 24, color: NAVY });
    text(title, { x: MARGIN + 12, width: contentWidth - 24, y: y - 16.5, size: 10.5, font: bold, color: WHITE });
    y -= 24 + 12;
  };
  const ensureSpace = (needed: number) => {
    if (y - needed < MARGIN + 10) {
      page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
      y = PAGE_HEIGHT - MARGIN;
    }
  };

  const WRAP_SIZE = 9.5;
  const wrapLines = (t: string, boxWidth: number, font: typeof hebrewRegular, size = WRAP_SIZE): string[] => {
    // Whole-string width estimate per line via the Hebrew font metrics (good enough for wrapping
    // purposes even for mixed Latin runs — this only decides where to break, not how to draw).
    const words = t.split(/\s+/).filter(Boolean);
    if (words.length === 0) return [""];
    const lines: string[] = [];
    let current = "";
    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, size) > boxWidth - 12 && current) {
        lines.push(current);
        current = word;
      } else {
        current = candidate;
      }
    }
    if (current) lines.push(current);
    return lines;
  };

  // ── Event details: label/value cells, two pairs per row.
  const detailPairs = (
    [
      ["סוג האירוע", eventDetails?.type],
      ["תאריך", eventDetails?.date],
      ["מיקום האירוע", eventDetails?.location],
      ["שעות העבודה", eventDetails?.workHours],
    ] as [string, string | undefined][]
  ).filter((p): p is [string, string] => !!p[1]?.trim());
  if (detailPairs.length) {
    y -= 6;
    sectionBar("פרטי האירוע");
    const gap = 6;
    const pairWidth = (contentWidth - gap) / 2;
    const labelWidth = 84;
    for (let i = 0; i < detailPairs.length; i += 2) {
      const rowHeight = 22;
      detailPairs.slice(i, i + 2).forEach(([label, value], j) => {
        const pairX = MARGIN + contentWidth - pairWidth - j * (pairWidth + gap);
        roundedRect(page, pairX + pairWidth - labelWidth, y, labelWidth, rowHeight, 3, NAVY_TINT);
        roundedRect(page, pairX, y, pairWidth - labelWidth - 4, rowHeight, 3, CELL);
        text(label, { x: pairX + pairWidth - labelWidth + 6, width: labelWidth - 12, y: y - 14.5, size: 9, font: bold, color: NAVY });
        text(value.trim(), { x: pairX + 6, width: pairWidth - labelWidth - 16, y: y - 14.5, size: 9.5, font: regular, color: INK });
      });
      y -= rowHeight + 5;
    }
    y -= 8;
  }

  // ── Items table: right-to-left column order (פריט rightmost) — פריט 30%, פרטים 48%, מחיר 22%.
  ensureSpace(80);
  sectionBar("פריטים");
  const gap = 4;
  const colPriceW = contentWidth * 0.22;
  const colItemW = contentWidth * 0.3;
  const colDetailsW = contentWidth - colPriceW - colItemW - gap * 2;
  const colPriceX = MARGIN;
  const colDetailsX = colPriceX + colPriceW + gap;
  const colItemX = colDetailsX + colDetailsW + gap;
  const columnHeader = () => {
    text("פריט", { x: colItemX + 6, width: colItemW - 12, y: y - 10, size: 9.5, font: bold, color: NAVY });
    text("פרטים", { x: colDetailsX + 6, width: colDetailsW - 12, y: y - 10, size: 9.5, font: bold, color: NAVY });
    text("מחיר", { x: colPriceX + 6, width: colPriceW - 12, y: y - 10, size: 9.5, font: bold, color: NAVY });
    y -= 20;
  };
  columnHeader();

  // The calculator auto-adds a "צילום אירוע" (event shoot) row summarizing the hours/rate — that's
  // redundant with the "סוג האירוע"/"שעות העבודה" cells already shown above, so it's dropped from
  // the printed table. Its price still counts toward subtotal/total (those come in already computed
  // from the full item list, not derived from what's rendered here).
  const displayItems = items.filter((row) => row.item.trim() !== "צילום אירוע");

  for (const row of displayItems) {
    const itemLines = wrapLines(row.item, colItemW, hebrewRegular);
    const detailLines = row.details?.trim() ? wrapLines(row.details, colDetailsW, hebrewRegular) : [];
    const rowHeight = Math.max(24, Math.max(itemLines.length, detailLines.length) * 13 + 11);
    if (y - rowHeight < MARGIN + 10) {
      page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
      y = PAGE_HEIGHT - MARGIN;
      columnHeader();
    }
    roundedRect(page, colItemX, y, colItemW, rowHeight, 3, CELL);
    roundedRect(page, colDetailsX, y, colDetailsW, rowHeight, 3, CELL);
    roundedRect(page, colPriceX, y, colPriceW, rowHeight, 3, CELL);
    itemLines.forEach((line, i) => text(line, { x: colItemX + 6, width: colItemW - 12, y: y - 15.5 - i * 13, size: WRAP_SIZE, font: bold, color: INK }));
    detailLines.forEach((line, i) => text(line, { x: colDetailsX + 6, width: colDetailsW - 12, y: y - 15.5 - i * 13, size: WRAP_SIZE, font: regular, color: INK_SOFT }));
    text(currency(row.price), { x: colPriceX + 6, width: colPriceW - 12, y: y - 15.5, size: WRAP_SIZE, font: regular, color: INK, align: "left" });
    y -= rowHeight + gap;
  }

  // ── Totals, on the left like an invoice: label cells in a navy tint, the final line in navy.
  y -= 12;
  const summaryRows: [string, number][] = showVat
    ? [
        ["סה״כ לפני מע״מ", subtotal],
        ["מע״מ", vatAmount],
      ]
    : [];
  ensureSpace(summaryRows.length * 26 + 34);
  const valueW = 92;
  const labelW = 150;
  const labelX = MARGIN + valueW + gap;
  for (const [label, value] of summaryRows) {
    roundedRect(page, labelX, y, labelW, 22, 3, NAVY_TINT);
    roundedRect(page, MARGIN, y, valueW, 22, 3, CELL);
    text(label, { x: labelX + 8, width: labelW - 16, y: y - 14.5, size: 9.5, font: bold, color: NAVY });
    text(currency(value), { x: MARGIN + 6, width: valueW - 12, y: y - 14.5, size: 9.5, font: regular, color: INK, align: "left" });
    y -= 26;
  }
  page.drawRectangle({ x: MARGIN, y: y - 28, width: valueW + gap + labelW, height: 28, color: NAVY });
  text(showVat ? "סה״כ לתשלום כולל מע״מ" : "סה״כ לתשלום (עוסק פטור)", {
    x: labelX + 8,
    width: labelW - 16,
    y: y - 18.5,
    size: 10,
    font: bold,
    color: WHITE,
  });
  text(currency(total), { x: MARGIN + 6, width: valueW - 12, y: y - 18.5, size: 11, font: bold, color: WHITE, align: "left" });
  y -= 28;

  // ── Notes.
  if (notes?.trim()) {
    y -= 22;
    const noteLines = wrapLines(notes.trim(), contentWidth - 24, hebrewRegular);
    ensureSpace(36 + noteLines.length * 13 + 16);
    sectionBar("הערות");
    const blockHeight = noteLines.length * 13 + 14;
    roundedRect(page, MARGIN, y, contentWidth, blockHeight, 4, CELL);
    noteLines.forEach((line, i) => text(line, { x: MARGIN + 12, width: contentWidth - 24, y: y - 16 - i * 13, size: 9.5, font: regular, color: INK }));
    y -= blockHeight;
  }

  return pdfDoc.save();
}
