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
const MARGIN = 44;

// The app's own palette (globals.css light theme): ink, gold and paper. The layout is the app's own
// too (owner's request, 2026-09-28: invoice-like, but nothing that reads as another product's
// document): a full-width ink band with a gold rule, the logo in a round badge over its edge, gold
// section headings, a paper card with a gold rail, a hairline table and a rounded totals card.
const INK = rgb(0.11, 0.106, 0.098); // --color-ink
const INK_SOFT = rgb(0.384, 0.369, 0.337); // --color-ink-soft
const GOLD = rgb(0.612, 0.478, 0.235); // --color-amber
const GOLD_DEEP = rgb(0.486, 0.373, 0.153); // --color-amber-deep
const GOLD_LIGHT = rgb(0.824, 0.678, 0.408); // the dark theme's amber, readable on ink
const PAPER = rgb(0.949, 0.937, 0.914); // --color-paper
const HAIRLINE = rgb(0.886, 0.867, 0.827); // --color-line
const ON_INK_SOFT = rgb(0.78, 0.76, 0.72);
const WHITE = rgb(1, 1, 1);

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

  // ── Header: full-width ink band, gold rule along its bottom edge. Right: the title and business
  // details. Left: the date. The logo sits in a round white badge straddling the band's edge.
  const bandHeight = 132;
  const bandBottom = PAGE_HEIGHT - bandHeight;
  page.drawRectangle({ x: 0, y: bandBottom, width: PAGE_WIDTH, height: bandHeight, color: INK });
  page.drawRectangle({ x: 0, y: bandBottom - 3, width: PAGE_WIDTH, height: 3, color: GOLD });

  const rightColW = contentWidth * 0.62;
  const rightColX = PAGE_WIDTH - MARGIN - rightColW;
  text("הצעת מחיר", { x: rightColX, width: rightColW, y: PAGE_HEIGHT - 44, size: 11, font: bold, color: GOLD_LIGHT });
  text(photographer.name, { x: rightColX, width: rightColW, y: PAGE_HEIGHT - 70, size: 20, font: bold, color: WHITE });
  const businessLabel = showVat ? "עוסק מורשה" : "עוסק פטור";
  const contact = [
    photographer.business_id?.trim() ? `${businessLabel} ${photographer.business_id.trim()}` : null,
    photographer.phone?.trim() || null,
    // The address a client sees on the quote must be one that actually receives mail.
    notificationEmailFor(photographer.email),
  ].filter((v): v is string => !!v);
  contact.forEach((line, i) => {
    text(line, { x: rightColX, width: rightColW, y: PAGE_HEIGHT - 92 - i * 13, size: 9, font: regular, color: ON_INK_SOFT });
  });
  text(formatDateDMY(createdAt), { x: MARGIN, width: contentWidth * 0.3, y: PAGE_HEIGHT - 44, size: 10, font: regular, color: ON_INK_SOFT, align: "left" });

  const badgeR = 40;
  const badgeCx = MARGIN + badgeR + 4;
  const badgeCy = bandBottom - 1;
  page.drawCircle({ x: badgeCx, y: badgeCy, size: badgeR + 3, color: GOLD });
  page.drawCircle({ x: badgeCx, y: badgeCy, size: badgeR, color: WHITE });
  if (logo) {
    const box = badgeR * 1.4;
    const scale = Math.min(box / logo.width, box / logo.height);
    const w = logo.width * scale;
    const h = logo.height * scale;
    page.drawImage(logo, { x: badgeCx - w / 2, y: badgeCy - h / 2, width: w, height: h });
  }

  let y = bandBottom - 34;
  const ensureSpace = (needed: number) => {
    if (y - needed < MARGIN) {
      page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
      page.drawRectangle({ x: 0, y: PAGE_HEIGHT - 6, width: PAGE_WIDTH, height: 6, color: INK });
      y = PAGE_HEIGHT - MARGIN;
    }
  };
  // Section heading: gold title with a short gold underline, right-aligned.
  const heading = (title: string) => {
    text(title, { x: MARGIN, width: contentWidth, y: y - 12, size: 12, font: bold, color: GOLD_DEEP });
    page.drawRectangle({ x: PAGE_WIDTH - MARGIN - 28, y: y - 20, width: 28, height: 2, color: GOLD });
    y -= 34;
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

  // ── Recipient + event details: one paper card with a gold rail on its right edge.
  const detailPairs = (
    [
      ["סוג האירוע", eventDetails?.type],
      ["תאריך", eventDetails?.date],
      ["מיקום", eventDetails?.location],
      ["שעות העבודה", eventDetails?.workHours],
    ] as [string, string | undefined][]
  ).filter((p): p is [string, string] => !!p[1]?.trim());
  const detailRows = Math.ceil(detailPairs.length / 2);
  const cardHeight = 44 + detailRows * 30 + (detailRows ? 6 : 0);
  // Keeps the card clear of the logo badge that hangs below the band on the left.
  const cardX = MARGIN + badgeR * 2 + 22;
  const cardWidth = PAGE_WIDTH - MARGIN - cardX;
  roundedRect(page, cardX, y, cardWidth, cardHeight, 8, PAPER);
  page.drawRectangle({ x: PAGE_WIDTH - MARGIN - 4, y: y - cardHeight, width: 4, height: cardHeight, color: GOLD });
  const cardInnerX = cardX + 16;
  const cardInnerW = cardWidth - 36;
  text("לכבוד", { x: cardInnerX, width: cardInnerW, y: y - 18, size: 8.5, font: regular, color: INK_SOFT });
  text(clientName || "לקוח/ה", { x: cardInnerX, width: cardInnerW, y: y - 34, size: 13, font: bold, color: INK });
  const pairW = cardInnerW / 2;
  detailPairs.forEach(([label, value], i) => {
    const row = Math.floor(i / 2);
    const col = i % 2;
    const px = cardInnerX + cardInnerW - pairW * (col + 1);
    const py = y - 52 - row * 30;
    text(label, { x: px, width: pairW - 8, y: py - 4, size: 8, font: regular, color: INK_SOFT });
    text(value.trim(), { x: px, width: pairW - 8, y: py - 17, size: 10, font: bold, color: INK });
  });
  y -= cardHeight + 26;

  // ── Items: hairline-separated rows, price on the left. Right-to-left column order —
  // פריט 32%, פרטים 44%, מחיר 24%.
  ensureSpace(90);
  heading("פירוט ההצעה");
  const colPriceW = contentWidth * 0.24;
  const colItemW = contentWidth * 0.32;
  const colDetailsW = contentWidth - colPriceW - colItemW;
  const colPriceX = MARGIN;
  const colDetailsX = colPriceX + colPriceW;
  const colItemX = colDetailsX + colDetailsW;
  const columnHeader = () => {
    text("פריט", { x: colItemX, width: colItemW, y: y - 8, size: 8.5, font: bold, color: INK_SOFT });
    text("פרטים", { x: colDetailsX + 8, width: colDetailsW - 16, y: y - 8, size: 8.5, font: bold, color: INK_SOFT });
    text("מחיר", { x: colPriceX, width: colPriceW, y: y - 8, size: 8.5, font: bold, color: INK_SOFT, align: "left" });
    y -= 14;
    page.drawLine({ start: { x: MARGIN, y }, end: { x: PAGE_WIDTH - MARGIN, y }, thickness: 1, color: INK });
  };
  columnHeader();

  // The calculator auto-adds a "צילום אירוע" (event shoot) row summarizing the hours/rate — that's
  // redundant with the "סוג האירוע"/"שעות העבודה" details already shown above, so it's dropped from
  // the printed table. Its price still counts toward subtotal/total (those come in already computed
  // from the full item list, not derived from what's rendered here).
  const displayItems = items.filter((row) => row.item.trim() !== "צילום אירוע");

  for (const row of displayItems) {
    const itemLines = wrapLines(row.item, colItemW, hebrewBold);
    const detailLines = row.details?.trim() ? wrapLines(row.details, colDetailsW - 16, hebrewRegular) : [];
    const rowHeight = Math.max(30, Math.max(itemLines.length, detailLines.length) * 13 + 17);
    if (y - rowHeight < MARGIN) {
      ensureSpace(rowHeight + 20);
      columnHeader();
    }
    itemLines.forEach((line, i) => text(line, { x: colItemX, width: colItemW, y: y - 19 - i * 13, size: WRAP_SIZE, font: bold, color: INK }));
    detailLines.forEach((line, i) => text(line, { x: colDetailsX + 8, width: colDetailsW - 16, y: y - 19 - i * 13, size: WRAP_SIZE, font: regular, color: INK_SOFT }));
    text(currency(row.price), { x: colPriceX, width: colPriceW, y: y - 19, size: WRAP_SIZE, font: regular, color: INK, align: "left" });
    y -= rowHeight;
    page.drawLine({ start: { x: MARGIN, y }, end: { x: PAGE_WIDTH - MARGIN, y }, thickness: 0.6, color: HAIRLINE });
  }

  // ── Totals: a rounded paper card on the left; the amount due on an ink strip, in gold.
  y -= 20;
  const summaryRows: [string, number][] = showVat
    ? [
        ["סה״כ לפני מע״מ", subtotal],
        ["מע״מ 18%", vatAmount],
      ]
    : [];
  const totalsW = 236;
  const totalsH = 16 + summaryRows.length * 22 + 40;
  ensureSpace(totalsH + 10);
  roundedRect(page, MARGIN, y, totalsW, totalsH, 10, PAPER);
  let ty = y - 12;
  for (const [label, value] of summaryRows) {
    text(label, { x: MARGIN + 14, width: totalsW - 28, y: ty - 10, size: 9.5, font: regular, color: INK_SOFT });
    text(currency(value), { x: MARGIN + 14, width: totalsW - 28, y: ty - 10, size: 9.5, font: regular, color: INK, align: "left" });
    ty -= 22;
  }
  roundedRect(page, MARGIN + 6, ty - 2, totalsW - 12, 34, 8, INK);
  text(showVat ? "לתשלום, כולל מע״מ" : "לתשלום (עוסק פטור)", { x: MARGIN + 18, width: totalsW - 36, y: ty - 23, size: 10, font: bold, color: WHITE });
  text(currency(total), { x: MARGIN + 18, width: totalsW - 36, y: ty - 23.5, size: 13, font: bold, color: GOLD_LIGHT, align: "left" });
  y -= totalsH;

  // ── Notes.
  if (notes?.trim()) {
    y -= 26;
    const noteLines = wrapLines(notes.trim(), contentWidth, hebrewRegular);
    ensureSpace(40 + noteLines.length * 14);
    heading("הערות");
    noteLines.forEach((line, i) => text(line, { x: MARGIN, width: contentWidth, y: y - i * 14, size: 9.5, font: regular, color: INK }));
    y -= noteLines.length * 14;
  }

  return pdfDoc.save();
}
