import type { PDFFont, PDFPage, RGB } from "pdf-lib";

const HEBREW_RANGE = /[֐-׿]/;

type Run = { text: string; rtl: boolean };

// Splits into runs of consecutive Hebrew vs. non-Hebrew characters — a lightweight stand-in for
// full Unicode bidi, good enough for short UI strings like an album title that mixes Hebrew words
// with digits/Latin. Whitespace attaches to whichever run it's adjacent to rather than starting a
// run of its own, so "שלום 2026" doesn't get split into three fragments.
function splitRuns(text: string): Run[] {
  const runs: Run[] = [];
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

// Lays out mixed Hebrew/Latin text as it would visually appear in an RTL paragraph: runs are
// ordered right-to-left overall, Hebrew runs have their characters reversed (Hebrew doesn't
// contextually shape, so a reversed logical string draws correctly left-to-right glyph-by-glyph),
// Latin/digit runs keep their natural order. Centers the whole line around `centerX`.
export function drawCenteredBidiText(
  page: PDFPage,
  text: string,
  opts: { centerX: number; y: number; size: number; hebrewFont: PDFFont; latinFont: PDFFont; color: RGB }
) {
  const visualRuns = [...splitRuns(text)].reverse().map((r) => ({
    text: r.rtl ? [...r.text].reverse().join("") : r.text,
    font: r.rtl ? opts.hebrewFont : opts.latinFont,
  }));
  const widths = visualRuns.map((r) => r.font.widthOfTextAtSize(r.text, opts.size));
  const totalWidth = widths.reduce((a, b) => a + b, 0);
  let cursorX = opts.centerX - totalWidth / 2;
  visualRuns.forEach((r, i) => {
    page.drawText(r.text, { x: cursorX, y: opts.y, size: opts.size, font: r.font, color: opts.color });
    cursorX += widths[i];
  });
}
