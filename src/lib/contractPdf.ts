import fs from "node:fs/promises";
import path from "node:path";
import { PDFDocument, PDFFont, PDFImage, PDFPage, rgb, type RGB } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { drawAlignedBidiText } from "@/lib/pdfText";
import type { EventContractRow } from "@/lib/types";

// A contract as a PDF (owner, 2026-10-18): the photographer downloads it from the event page and
// sends it to the client. The contract's own text, then the client's signature: once signed, the
// name, the drawn signature, when, and from which address; before that, empty lines to sign on
// paper. Same look as the price quote
// (priceQuotePdf.ts): Rubik, a navy header band with a brass rule. The contract is always Hebrew
// (its terms are never translated), so the document is right-to-left.

const PAGE_WIDTH = 595;
const PAGE_HEIGHT = 842;
const MARGIN = 48;
const CONTENT_W = PAGE_WIDTH - MARGIN * 2;

const NAVY = rgb(0.043, 0.071, 0.125); // #0b1220
const INK = rgb(0.11, 0.106, 0.098); // #1c1b19
const INK_SOFT = rgb(0.337, 0.376, 0.478); // #56607a
const BRASS = rgb(0.561, 0.435, 0.184); // #8f6f2f
const BRASS_DEEP = rgb(0.486, 0.373, 0.153); // #7c5f27
const BRASS_LIGHT = rgb(0.788, 0.631, 0.353); // #c9a15a, on navy
const GREY = rgb(0.933, 0.945, 0.965); // #eef1f6
const LINE = rgb(0.863, 0.882, 0.918); // #dce1ea
const ON_NAVY_SOFT = rgb(0.682, 0.722, 0.8); // #aeb8cc
const WHITE = rgb(1, 1, 1);

function roundedRect(page: PDFPage, x: number, top: number, width: number, height: number, radius: number, color: RGB) {
  const r = Math.min(radius, height / 2, width / 2);
  const d = `M ${r} 0 H ${width - r} Q ${width} 0 ${width} ${r} V ${height - r} Q ${width} ${height} ${width - r} ${height} H ${r} Q 0 ${height} 0 ${height - r} V ${r} Q 0 0 ${r} 0 Z`;
  page.drawSvgPath(d, { x, y: top, color, borderWidth: 0 });
}

async function embedImageAuto(pdfDoc: PDFDocument, bytes: Uint8Array): Promise<PDFImage | null> {
  const isPng = bytes.length > 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
  try {
    return isPng ? await pdfDoc.embedPng(bytes) : await pdfDoc.embedJpg(bytes);
  } catch {
    return null;
  }
}

const israelTime = (iso: string) => {
  const d = new Date(iso);
  const date = d.toLocaleDateString("he-IL", { timeZone: "Asia/Jerusalem", day: "2-digit", month: "2-digit", year: "numeric" });
  const time = d.toLocaleTimeString("he-IL", { timeZone: "Asia/Jerusalem", hour: "2-digit", minute: "2-digit", hour12: false });
  return { date, time };
};

export async function buildContractPdf(params: {
  studio: string;
  logoBuffer: Buffer | null;
  clientName: string;
  eventDate: string | null;
  contract: Pick<EventContractRow, "contract_text" | "signer_name" | "signer_ip" | "signed_at" | "signature_data_url">;
}): Promise<Uint8Array> {
  const { studio, logoBuffer, clientName, eventDate, contract } = params;
  const pdfDoc = await PDFDocument.create();
  pdfDoc.registerFontkit(fontkit);
  const fontsDir = path.join(process.cwd(), "src/assets/fonts");
  const [bold, regular] = await Promise.all([
    pdfDoc.embedFont(await fs.readFile(path.join(fontsDir, "Rubik-Bold.ttf")), { subset: true }),
    pdfDoc.embedFont(await fs.readFile(path.join(fontsDir, "Rubik-Regular.ttf")), { subset: true }),
  ]);
  pdfDoc.setTitle(`חוזה הזמנה - ${clientName}`);
  pdfDoc.setAuthor(studio);

  // Rubik has no emoji (a WhatsApp signature often ends with one): drop what it can't draw, so the
  // line widths used for wrapping are the widths drawn.
  const drawable = new Set(regular.getCharacterSet());
  const clean = (t: string) =>
    [...t]
      .filter((ch) => ch === " " || drawable.has(ch.codePointAt(0)!))
      .join("")
      .replace(/ {2,}/g, " ")
      .trim();

  let page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  const text = (t: string, o: { x: number; width: number; y: number; size: number; font: PDFFont; color: RGB; align?: "left" | "right" | "center" }) =>
    drawAlignedBidiText(page, t, { boxX: o.x, boxWidth: o.width, y: o.y, size: o.size, align: o.align ?? "right", color: o.color, hebrewFont: o.font, latinFont: o.font });

  const wrap = (t: string, width: number, font: PDFFont, size: number): string[] => {
    const words = t.split(/\s+/).filter(Boolean);
    if (!words.length) return [];
    const lines: string[] = [];
    let cur = "";
    for (const w of words) {
      const cand = cur ? `${cur} ${w}` : w;
      if (font.widthOfTextAtSize(cand, size) > width && cur) {
        lines.push(cur);
        cur = w;
      } else cur = cand;
    }
    if (cur) lines.push(cur);
    return lines;
  };

  // ── Header band: the document, the studio, the client and event date; the signing date on the left.
  const bandH = 112;
  page.drawRectangle({ x: 0, y: PAGE_HEIGHT - bandH, width: PAGE_WIDTH, height: bandH, color: NAVY });
  page.drawRectangle({ x: 0, y: PAGE_HEIGHT - bandH - 3, width: PAGE_WIDTH, height: 3, color: BRASS });
  const isSigned = !!contract.signed_at;
  text(isSigned ? "חוזה הזמנה חתום" : "חוזה הזמנה", { x: MARGIN, width: CONTENT_W, y: PAGE_HEIGHT - 42, size: 11, font: bold, color: BRASS_LIGHT });
  text(clean(studio), { x: MARGIN + CONTENT_W * 0.3, width: CONTENT_W * 0.7, y: PAGE_HEIGHT - 70, size: 20, font: bold, color: WHITE });
  const eventLine = [clean(clientName), eventDate ? `האירוע: ${new Date(eventDate).toLocaleDateString("he-IL")}` : null].filter(Boolean).join(" · ");
  text(eventLine, { x: MARGIN + CONTENT_W * 0.3, width: CONTENT_W * 0.7, y: PAGE_HEIGHT - 92, size: 10, font: regular, color: ON_NAVY_SOFT });
  if (contract.signed_at) {
    text(`נחתם ${israelTime(contract.signed_at).date}`, { x: MARGIN, width: CONTENT_W * 0.3, y: PAGE_HEIGHT - 42, size: 10, font: regular, color: ON_NAVY_SOFT, align: "left" });
  }
  const logo = logoBuffer ? await embedImageAuto(pdfDoc, new Uint8Array(logoBuffer)) : null;
  if (logo) {
    const box = 52;
    const scale = Math.min(box / logo.width, box / logo.height);
    const w = logo.width * scale;
    const h = logo.height * scale;
    const cx = MARGIN + 30;
    const cy = PAGE_HEIGHT - 80;
    page.drawCircle({ x: cx, y: cy, size: 30, color: WHITE });
    page.drawImage(logo, { x: cx - w / 2, y: cy - h / 2, width: w, height: h });
  }

  let y = PAGE_HEIGHT - bandH - 34;
  const newPage = () => {
    page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    page.drawRectangle({ x: 0, y: PAGE_HEIGHT - 6, width: PAGE_WIDTH, height: 6, color: NAVY });
    y = PAGE_HEIGHT - 44;
  };
  const room = (h: number) => {
    if (y - h < MARGIN + 24) newPage();
  };

  // ── The contract as signed. The first line is its title; "1. פרטי האירוע" and the like (short
  // numbered lines, not the numbered clauses inside the terms), and "לפירוט המלא", are headings.
  const SIZE = 10;
  const LEAD = 15.5;
  const rows = contract.contract_text.replace(/\r\n?/g, "\n").split("\n");
  let titled = false;
  for (const raw of rows) {
    const line = clean(raw);
    if (!line) {
      y -= LEAD * 0.5;
      continue;
    }
    if (!titled) {
      titled = true;
      room(30);
      text(line, { x: MARGIN, width: CONTENT_W, y: y - 14, size: 15, font: bold, color: NAVY });
      y -= 34;
      continue;
    }
    if ((/^\d+\.\s/.test(line) && line.length <= 32) || line === "לפירוט המלא") {
      room(LEAD * 3);
      y -= 6;
      text(line, { x: MARGIN, width: CONTENT_W, y: y - 11, size: 11.5, font: bold, color: BRASS_DEEP });
      y -= LEAD + 6;
      continue;
    }
    // A list line ("• צלם וידאו") wraps under its own text, not under the bullet.
    const bullet = line.startsWith("• ");
    const indent = bullet ? 12 : 0;
    const body = bullet ? line.slice(2) : line;
    wrap(body, CONTENT_W - indent, regular, SIZE).forEach((l, i) => {
      room(LEAD);
      if (bullet && i === 0) text("•", { x: PAGE_WIDTH - MARGIN - 8, width: 8, y: y - SIZE, size: SIZE, font: bold, color: BRASS });
      text(l, { x: MARGIN, width: CONTENT_W - indent, y: y - SIZE, size: SIZE, font: regular, color: INK });
      y -= LEAD;
    });
  }

  // ── The client's signature: a grey card with a brass rail. Name, when (Israel time) and the
  // address it was signed from on the right, the drawn signature on the left. Not signed yet: a
  // line for the name and the date, and an empty box to sign in.
  const sigImage = contract.signature_data_url?.startsWith("data:image/png;base64,")
    ? await embedImageAuto(pdfDoc, new Uint8Array(Buffer.from(contract.signature_data_url.slice("data:image/png;base64,".length), "base64")))
    : null;
  const cardH = 118;
  room(cardH + 46);
  y -= 18;
  text("חתימת הלקוח/ה", { x: MARGIN, width: CONTENT_W, y: y - 11, size: 11.5, font: bold, color: BRASS_DEEP });
  y -= 26;
  roundedRect(page, MARGIN, y, CONTENT_W, cardH, 8, GREY);
  page.drawRectangle({ x: PAGE_WIDTH - MARGIN - 4, y: y - cardH, width: 4, height: cardH, color: BRASS });
  const infoW = CONTENT_W * 0.52;
  const infoX = PAGE_WIDTH - MARGIN - 18 - infoW;
  const signed = contract.signed_at ? israelTime(contract.signed_at) : null;
  const info: [string, string][] = isSigned
    ? [
        ["שם החותם/ת", clean(contract.signer_name ?? "")],
        ["תאריך ושעת החתימה", signed ? `${signed.date}, ${signed.time} (שעון ישראל)` : ""],
        ["נחתם מכתובת", clean(contract.signer_ip ?? "")],
      ]
    : [
        ["שם מלא", ""],
        ["תאריך", ""],
      ];
  info.forEach(([label, value], i) => {
    const top = y - 16 - i * 32;
    text(label, { x: infoX, width: infoW, y: top - 6, size: 8.5, font: regular, color: INK_SOFT });
    if (isSigned) text(value || "—", { x: infoX, width: infoW, y: top - 20, size: 10.5, font: bold, color: NAVY });
    else page.drawLine({ start: { x: infoX + infoW * 0.25, y: top - 22 }, end: { x: infoX + infoW, y: top - 22 }, thickness: 0.8, color: INK_SOFT });
  });
  // The drawn signature, on white, fitted into the left part of the card.
  const sigBoxW = CONTENT_W * 0.38;
  const sigBoxH = cardH - 24;
  const sigBoxX = MARGIN + 12;
  roundedRect(page, sigBoxX, y - 12, sigBoxW, sigBoxH, 6, WHITE);
  if (sigImage) {
    const scale = Math.min((sigBoxW - 16) / sigImage.width, (sigBoxH - 16) / sigImage.height);
    const w = sigImage.width * scale;
    const h = sigImage.height * scale;
    page.drawImage(sigImage, { x: sigBoxX + (sigBoxW - w) / 2, y: y - 12 - sigBoxH + (sigBoxH - h) / 2, width: w, height: h });
  }
  if (!isSigned) text("חתימה", { x: sigBoxX + 8, width: sigBoxW - 16, y: y - 12 - sigBoxH + 8, size: 8, font: regular, color: INK_SOFT });
  y -= cardH + 14;
  text(isSigned ? "החוזה נחתם בחתימה אלקטרונית, לפי חוק חתימה אלקטרונית, התשס\"א-2001." : "החוזה עוד לא נחתם. אפשר לחתום עליו בקישור לחתימה שנשלח.", {
    x: MARGIN,
    width: CONTENT_W,
    y: y - 9,
    size: 8.5,
    font: regular,
    color: INK_SOFT,
  });

  // ── Page numbers.
  const pages = pdfDoc.getPages();
  pages.forEach((p, i) => {
    p.drawLine({ start: { x: MARGIN, y: MARGIN - 4 }, end: { x: PAGE_WIDTH - MARGIN, y: MARGIN - 4 }, thickness: 0.6, color: LINE });
    drawAlignedBidiText(p, `עמוד ${i + 1} מתוך ${pages.length}`, {
      boxX: MARGIN,
      boxWidth: CONTENT_W,
      y: MARGIN - 18,
      size: 8,
      align: "center",
      color: INK_SOFT,
      hebrewFont: regular,
      latinFont: regular,
    });
  });

  return pdfDoc.save();
}
