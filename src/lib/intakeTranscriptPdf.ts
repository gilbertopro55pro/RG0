import fs from "node:fs/promises";
import path from "node:path";
import { PDFDocument, PDFFont, PDFPage, rgb, type RGB } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { drawAlignedBidiText } from "@/lib/pdfText";

// The intake assistant's conversation as a designed PDF (owner's request, 2026-09-28): attached to
// the photographer's "new lead" email so they can forward it to the client on WhatsApp. Same look
// as the price quote (priceQuotePdf.ts): the landing palette, Rubik, a navy header band with a
// brass rule, a grey details card with a brass rail, then the conversation as chat bubbles.

const PAGE_WIDTH = 595;
const PAGE_HEIGHT = 842;
const MARGIN = 44;
const CONTENT_W = PAGE_WIDTH - MARGIN * 2;

const NAVY = rgb(0.043, 0.071, 0.125); // #0b1220
const NAVY_BUBBLE = rgb(0.094, 0.141, 0.235); // #18243c, reads as navy at bubble size
const INK_SOFT = rgb(0.337, 0.376, 0.478); // #56607a
const BRASS = rgb(0.561, 0.435, 0.184); // #8f6f2f
const BRASS_DEEP = rgb(0.486, 0.373, 0.153); // #7c5f27
const BRASS_LIGHT = rgb(0.788, 0.631, 0.353); // #c9a15a, on navy
const GREY = rgb(0.933, 0.945, 0.965); // #eef1f6
const LINE = rgb(0.863, 0.882, 0.918); // #dce1ea
const ON_NAVY_SOFT = rgb(0.682, 0.722, 0.8); // #aeb8cc
const WHITE = rgb(1, 1, 1);

export type TranscriptLine = { role: "client" | "assistant"; text: string };

function roundedRect(page: PDFPage, x: number, top: number, width: number, height: number, radius: number, color: RGB) {
  const r = Math.min(radius, height / 2, width / 2);
  const d = `M ${r} 0 H ${width - r} Q ${width} 0 ${width} ${r} V ${height - r} Q ${width} ${height} ${width - r} ${height} H ${r} Q 0 ${height} 0 ${height - r} V ${r} Q 0 0 ${r} 0 Z`;
  page.drawSvgPath(d, { x, y: top, color, borderWidth: 0 });
}

export async function buildIntakeTranscriptPdf(params: {
  studio: string;
  clientName: string;
  // Pre-formatted [label, value] pairs (the lead's details), in display order.
  details: [string, string][];
  transcript: TranscriptLine[];
  createdAt: Date;
}): Promise<Uint8Array> {
  const { studio, clientName, details, transcript, createdAt } = params;
  const pdfDoc = await PDFDocument.create();
  pdfDoc.registerFontkit(fontkit);
  const fontsDir = path.join(process.cwd(), "src/assets/fonts");
  const [bold, regular] = await Promise.all([
    pdfDoc.embedFont(await fs.readFile(path.join(fontsDir, "Rubik-Bold.ttf")), { subset: true }),
    pdfDoc.embedFont(await fs.readFile(path.join(fontsDir, "Rubik-Regular.ttf")), { subset: true }),
  ]);
  // Rubik has no emoji; drop anything it can't draw instead of printing empty boxes.
  const drawable = new Set(regular.getCharacterSet());
  const clean = (t: string) =>
    [...t]
      .filter((ch) => /\s/.test(ch) || drawable.has(ch.codePointAt(0)!))
      .join("")
      .replace(/[ \t]+/g, " ")
      .trim();

  let page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  const text = (t: string, o: { x: number; width: number; y: number; size: number; font: PDFFont; color: RGB; align?: "left" | "right" | "center" }) =>
    drawAlignedBidiText(page, t, { boxX: o.x, boxWidth: o.width, y: o.y, size: o.size, align: o.align ?? "right", color: o.color, hebrewFont: o.font, latinFont: o.font });

  const wrap = (t: string, width: number, font: PDFFont, size: number): string[] =>
    t
      .replace(/\r\n?/g, "\n")
      .split("\n")
      .flatMap((para) => {
        const words = para.split(/\s+/).filter(Boolean);
        if (!words.length) return [""];
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
      });

  // ── Header band.
  const bandH = 112;
  page.drawRectangle({ x: 0, y: PAGE_HEIGHT - bandH, width: PAGE_WIDTH, height: bandH, color: NAVY });
  page.drawRectangle({ x: 0, y: PAGE_HEIGHT - bandH - 3, width: PAGE_WIDTH, height: 3, color: BRASS });
  const d = createdAt.toLocaleDateString("he-IL", { timeZone: "Asia/Jerusalem", day: "2-digit", month: "2-digit", year: "numeric" });
  text("סיכום השיחה", { x: MARGIN, width: CONTENT_W, y: PAGE_HEIGHT - 44, size: 11, font: bold, color: BRASS_LIGHT });
  text(clean(studio), { x: MARGIN, width: CONTENT_W, y: PAGE_HEIGHT - 72, size: 20, font: bold, color: WHITE });
  text(clientName ? `השיחה עם ${clean(clientName)}` : "השיחה עם הלקוח", { x: MARGIN + CONTENT_W * 0.3, width: CONTENT_W * 0.7, y: PAGE_HEIGHT - 92, size: 10, font: regular, color: ON_NAVY_SOFT });
  text(d, { x: MARGIN, width: CONTENT_W * 0.3, y: PAGE_HEIGHT - 44, size: 10, font: regular, color: ON_NAVY_SOFT, align: "left" });

  let y = PAGE_HEIGHT - bandH - 28;

  // ── Event details: grey card with a brass rail, two columns of label/value pairs.
  const pairs = details.map(([l, v]) => [l, clean(v)] as [string, string]).filter(([, v]) => v);
  if (pairs.length) {
    const colW = (CONTENT_W - 36) / 2;
    const rows = Math.ceil(pairs.length / 2);
    const rowH = 34;
    const cardH = 22 + rows * rowH;
    roundedRect(page, MARGIN, y, CONTENT_W, cardH, 8, GREY);
    page.drawRectangle({ x: PAGE_WIDTH - MARGIN - 4, y: y - cardH, width: 4, height: cardH, color: BRASS });
    pairs.forEach(([label, value], i) => {
      const col = i % 2;
      const row = Math.floor(i / 2);
      const x = PAGE_WIDTH - MARGIN - 20 - (col + 1) * colW;
      const top = y - 14 - row * rowH;
      text(label, { x, width: colW, y: top - 8, size: 8.5, font: regular, color: INK_SOFT });
      const v = wrap(value, colW - 8, bold, 10)[0] ?? "";
      text(v, { x, width: colW, y: top - 22, size: 10, font: bold, color: NAVY });
    });
    y -= cardH + 30;
  }

  // ── The conversation.
  text("השיחה", { x: MARGIN, width: CONTENT_W, y: y - 12, size: 12, font: bold, color: BRASS_DEEP });
  page.drawRectangle({ x: PAGE_WIDTH - MARGIN - 28, y: y - 20, width: 28, height: 2, color: BRASS });
  y -= 40;

  const SIZE = 10;
  const LEAD = 15;
  const PAD_X = 12;
  const PAD_Y = 9;
  const maxBubbleText = CONTENT_W * 0.72 - PAD_X * 2;
  const newPage = () => {
    page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    page.drawRectangle({ x: 0, y: PAGE_HEIGHT - 6, width: PAGE_WIDTH, height: 6, color: NAVY });
    y = PAGE_HEIGHT - 40;
  };
  const who = { client: clientName ? clean(clientName) : "הלקוח", assistant: `העוזר של ${clean(studio)}` };

  let prev: TranscriptLine["role"] | null = null;
  for (const line of transcript) {
    const body = clean(line.text);
    if (!body) continue;
    const isClient = line.role === "client";
    const font = regular;
    const lines = wrap(body, maxBubbleText, font, SIZE);
    const textW = Math.max(...lines.map((l) => font.widthOfTextAtSize(l, SIZE)), 40);
    const bw = Math.min(textW + PAD_X * 2, CONTENT_W * 0.72);
    const showName = prev !== line.role;
    // Split a bubble across pages only by lines; each page gets its own bubble piece.
    let i = 0;
    while (i < lines.length) {
      const nameH = showName && i === 0 ? 16 : 0;
      const room = Math.floor((y - MARGIN - nameH - PAD_Y * 2) / LEAD);
      if (room < 1) {
        newPage();
        continue;
      }
      const chunk = lines.slice(i, i + room);
      const bh = chunk.length * LEAD + PAD_Y * 2 - 4;
      // Assistant on the right (RTL reading start), client on the left, like a chat.
      const bx = isClient ? MARGIN : PAGE_WIDTH - MARGIN - bw;
      if (nameH) {
        text(isClient ? who.client : who.assistant, { x: bx, width: bw, y: y - 10, size: 8, font: bold, color: INK_SOFT, align: isClient ? "left" : "right" });
        y -= nameH;
      }
      roundedRect(page, bx, y, bw, bh, 10, isClient ? NAVY_BUBBLE : GREY);
      chunk.forEach((l, k) => {
        text(l, { x: bx + PAD_X, width: bw - PAD_X * 2, y: y - PAD_Y - 8 - k * LEAD, size: SIZE, font, color: isClient ? WHITE : NAVY });
      });
      y -= bh + 8;
      i += chunk.length;
    }
    prev = line.role;
  }

  // ── Footer on the last page.
  if (y < MARGIN + 30) newPage();
  page.drawLine({ start: { x: MARGIN, y: MARGIN + 14 }, end: { x: PAGE_WIDTH - MARGIN, y: MARGIN + 14 }, thickness: 0.8, color: LINE });
  text(`השיחה נשמרה אוטומטית ע״י העוזר של ${clean(studio)}`, { x: MARGIN, width: CONTENT_W, y: MARGIN, size: 8, font: regular, color: INK_SOFT });

  return pdfDoc.save();
}
