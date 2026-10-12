import type { PDFFont, PDFPage, RGB } from "pdf-lib";

const HEBREW_RANGE = /[֐-׿]/;
// Only actual Latin letters and digits force a run to switch to the Latin font — everything else
// (spaces, periods, colons, dashes, other punctuation) is a bidi-neutral character that attaches
// to whichever run it's adjacent to. Treating punctuation as "Latin" (an earlier version of this
// function effectively did, by testing "is this NOT Hebrew") fractured something like "ח.פ" or
// "לכבוד:" into a separate one-character run per letter, which then landed in the wrong visual
// position once the run order got reversed for RTL layout — e.g. "ח.פ: 039119243" coming out as
// "039119243 ח .פ" instead of staying together as "ח.פ:" beside the number.
const LATIN_STRONG_RANGE = /[A-Za-z0-9]/;

export type Run = { text: string; rtl: boolean };

function isStrongForDirection(ch: string, rtl: boolean): boolean {
  return rtl ? HEBREW_RANGE.test(ch) : LATIN_STRONG_RANGE.test(ch);
}

// A neutral character attaches to the run before it (see splitRuns below), which positions it
// correctly as long as that run stays visually adjacent to what follows — but layoutVisualRuns's
// top-level reversal flips each run's screen position, so a neutral trailing a run that ends up
// drawn on the FAR side of a direction boundary (its own outer edge, not the shared edge with its
// neighbor) ends up nowhere near the run it was meant to separate — e.g. the space in
// "22,222 ש״ח" landing at the line's outer edge instead of between the number and the currency,
// or a whole "(18%)" parenthetical drifting away from the label it's attached to. Splitting
// boundary-trailing neutrals into their own run, inserted between the two runs they separate,
// keeps them pinned to that shared boundary regardless of which side ends up where after
// reversal — and since that boundary run crosses the same reversal, its OWN characters need to be
// reversed too, or its two ends (e.g. a leading "(" vs a trailing " ") land against the wrong
// neighbor once the neighbors swap sides.
function splitBoundaryNeutrals(runs: Run[]): Run[] {
  const result = [...runs];
  for (let i = 0; i < result.length - 1; i++) {
    if (result[i].rtl === result[i + 1].rtl) continue;
    let text = result[i].text;
    let migrated = "";
    while (text.length > 0 && !isStrongForDirection(text[text.length - 1], result[i].rtl)) {
      migrated = text[text.length - 1] + migrated;
      text = text.slice(0, -1);
    }
    if (migrated && text) {
      result[i] = { ...result[i], text };
      result.splice(i + 1, 0, { text: [...migrated].reverse().join(""), rtl: false });
      i++;
    }
  }
  return result;
}

// Splits into runs of consecutive Hebrew vs. non-Hebrew characters — a lightweight stand-in for
// full Unicode bidi, good enough for short UI strings like an album title that mixes Hebrew words
// with digits/Latin. Neutral characters (whitespace, punctuation) attach to whichever run they're
// adjacent to rather than starting a run of their own, so "שלום 2026" and "ח.פ: 123" don't get
// split into more fragments than the Hebrew/Latin boundary actually requires.
export function splitRuns(text: string): Run[] {
  const runs: Run[] = [];
  let current = "";
  let currentRtl: boolean | null = null;
  for (const ch of text) {
    const isRtl: boolean = HEBREW_RANGE.test(ch)
      ? true
      : LATIN_STRONG_RANGE.test(ch)
        ? false
        : (currentRtl ?? HEBREW_RANGE.test(text));
    if (currentRtl === null) currentRtl = isRtl;
    if (isRtl !== currentRtl) {
      runs.push({ text: current, rtl: currentRtl });
      current = "";
      currentRtl = isRtl;
    }
    current += ch;
  }
  if (current) runs.push({ text: current, rtl: currentRtl ?? true });
  return splitBoundaryNeutrals(runs);
}

// A run classified "rtl" for ordering purposes (Hebrew letters plus any punctuation attached to
// them, e.g. "ח.פ: ") can still contain characters the embedded Hebrew font subset has no glyph
// for at all — confirmed by inspecting its cmap, it covers Hebrew-block codepoints (which
// includes geresh/gershayim, ׳ ״) plus only space and hyphen outside that block; ASCII punctuation
// like "." ":" "," "%" isn't in it. Those need latinFont to actually render instead of a
// missing-glyph box.
const HEBREW_FONT_EXTRA_CHARS = new Set([" ", "-"]);
function hebrewFontCovers(ch: string): boolean {
  return HEBREW_RANGE.test(ch) || HEBREW_FONT_EXTRA_CHARS.has(ch);
}

// Splits a single rtl-classified run into font-appropriate segments, SEGMENTS reversed relative
// to each other (same right-to-left ordering rule layoutVisualRuns applies at the top level, just
// applied one level deeper so a punctuation character that needs latinFont doesn't end up
// detached from the Hebrew text it's actually attached to — e.g. "ח.פ: " needs to draw, left to
// right, as [trailing-space-and-colon] [פ] [.] [ח] for "ח.פ: " to read correctly right-to-left).
// Each segment's own characters stay in logical (natural) order — NOT reversed here. This went
// back and forth: a manual per-character reversal was added under the belief that neither
// pdf-lib's drawText nor fontkit's layout() do bidi visual reordering on their own. That belief
// was wrong, and provably so: page.drawText → PDFFont.encodeText → (for a custom embedded font,
// which is what this app always uses for Hebrew) CustomFontEmbedder.encodeText, whose source
// (node_modules/pdf-lib/es/core/embedders/CustomFontEmbedder.js) calls
// `this.font.layout(text, this.fontFeatures).glyphs` — the exact same fontkit `layout()` call
// proven (by calling it directly and inspecting each returned glyph's own codePoints) to already
// reverse Hebrew codepoints into drawable visual order on its own. Reversing the string before
// that call reverses it twice, cancelling back to natural order — which for RTL text IS the
// backwards result. (The manual reversal's own comment claimed this was checked against real
// rendered PDF output; that check was a human eyeballing rendered Hebrew glyphs, a method that
// proved unreliable elsewhere in this same investigation — the definitive check is the
// codePoints one above, not reading the render.)
function segmentsByGlyphCoverage(text: string, hebrewFont: PDFFont, latinFont: PDFFont): { text: string; font: PDFFont }[] {
  const segments: { text: string; font: PDFFont }[] = [];
  let current = "";
  let currentFont: PDFFont | null = null;
  for (const ch of text) {
    const font = hebrewFontCovers(ch) ? hebrewFont : latinFont;
    if (currentFont === null) currentFont = font;
    if (font !== currentFont) {
      segments.push({ text: current, font: currentFont });
      current = "";
      currentFont = font;
    }
    current += ch;
  }
  if (current && currentFont) segments.push({ text: current, font: currentFont });
  return segments.reverse();
}

// Bidi_Mirrored characters: in a right-to-left run "(" has to be drawn as ")" and the other way
// round, the way a browser draws them. fontkit reverses a Hebrew run's glyphs (see above) but never
// mirrors them, so "מגנטים (2 אנשי צוות)" came out of the quote PDF as "מגנטים )2 אנשי צוות("
// (owner, 2026-10-12).
const MIRRORED: Record<string, string> = { "(": ")", ")": "(", "[": "]", "]": "[", "{": "}", "}": "{", "<": ">", ">": "<", "«": "»", "»": "«" };
const OPENING = new Set(["(", "[", "{"]);
const CLOSING_OF: Record<string, string> = { ")": "(", "]": "[", "}": "{" };
const LETTER = /\p{L}/u;
const DIGIT = /[0-9]/;
// Kept with the number they touch ("18%", "1,200", "050-1234567", "12.8.2027").
const NUMBER_SUFFIX = /[%‰°#\p{Sc}]/u;
const NUMBER_SEPARATOR = /[.,:/+\-]/;

// The direction each character is drawn in, for a line with Hebrew in it (a right-to-left
// paragraph). A small version of the Unicode bidi algorithm, enough for one line of a quote, a
// contract or an album page:
// - Hebrew is right-to-left; other letters and digits are left-to-right.
// - Digits count as left-to-right everywhere, so "10:00 - 13:00" and "2 - 3" keep the order they
//   always had in these PDFs (a browser would flip a spaced range in Hebrew text).
// - A bracket pair takes the direction of what is inside it, as in the algorithm's rule N0, so
//   "(18%)" and "(Gold)" stay around their contents.
// - Any other run of neutrals (spaces, punctuation) between two characters of one direction takes
//   that direction, and right-to-left otherwise (also at the line's two ends).
function resolveRtlLine(chars: string[]): boolean[] {
  const type = chars.map((ch): "R" | "L" | "N" => (HEBREW_RANGE.test(ch) ? "R" : LETTER.test(ch) || DIGIT.test(ch) ? "L" : "N"));
  // Number suffixes and separators that belong to a number.
  for (let i = 0; i < chars.length; i++) {
    if (type[i] !== "N") continue;
    const prevDigit = i > 0 && DIGIT.test(chars[i - 1]);
    const nextDigit = i + 1 < chars.length && DIGIT.test(chars[i + 1]);
    if ((NUMBER_SEPARATOR.test(chars[i]) && prevDigit && nextDigit) || (NUMBER_SUFFIX.test(chars[i]) && (prevDigit || nextDigit))) type[i] = "L";
  }
  const rtl: (boolean | null)[] = type.map((t) => (t === "R" ? true : t === "L" ? false : null));
  const strongBefore = (i: number) => {
    for (let k = i - 1; k >= 0; k--) if (rtl[k] !== null) return rtl[k]!;
    return true;
  };
  // Bracket pairs (innermost last, so an outer pair is resolved first and its inner pairs see it).
  const pairs: [number, number][] = [];
  const stack: number[] = [];
  chars.forEach((ch, i) => {
    if (OPENING.has(ch)) stack.push(i);
    else if (CLOSING_OF[ch]) {
      const at = stack.map((o) => chars[o]).lastIndexOf(CLOSING_OF[ch]);
      if (at >= 0) {
        pairs.push([stack[at], i]);
        stack.length = at;
      }
    }
  });
  pairs.sort((a, b) => a[0] - b[0]);
  for (const [open, close] of pairs) {
    const inside = type.slice(open + 1, close);
    const dir = inside.includes("R") ? true : inside.includes("L") ? strongBefore(open) === false ? false : true : null;
    if (dir === null) continue;
    rtl[open] = dir;
    rtl[close] = dir;
  }
  // Remaining neutrals: the direction on both sides when it's the same, right-to-left otherwise.
  for (let i = 0; i < chars.length; i++) {
    if (rtl[i] !== null) continue;
    let j = i;
    while (j < chars.length && rtl[j] === null) j++;
    const before = strongBefore(i);
    const after = j < chars.length ? rtl[j]! : true;
    for (let k = i; k < j; k++) rtl[k] = before === after ? before : true;
    i = j - 1;
  }
  return rtl as boolean[];
}

// Runs in the order they're drawn, left to right. A line without Hebrew is one left-to-right run.
// In a right-to-left run the brackets are mirrored, and the characters stay in logical order when
// there's Hebrew in it (fontkit reverses those itself) or are reversed here when there isn't (a lone
// " (" between two runs).
function visualRunsOf(text: string): Run[] {
  const chars = [...text];
  if (!chars.some((ch) => HEBREW_RANGE.test(ch))) return text ? [{ text, rtl: false }] : [];
  const rtl = resolveRtlLine(chars);
  const runs: Run[] = [];
  chars.forEach((ch, i) => {
    const c = rtl[i] ? (MIRRORED[ch] ?? ch) : ch;
    const last = runs[runs.length - 1];
    if (last && last.rtl === rtl[i]) last.text += c;
    else runs.push({ text: c, rtl: rtl[i] });
  });
  return runs.reverse();
}

// Characters neither font has a glyph for (emoji in a studio name, 2026-10-12) are left out, the
// way intakeTranscriptPdf.ts does, instead of printing an empty box. Whitespace always stays.
const charsetCache = new WeakMap<PDFFont, Set<number>>();
function drawable(font: PDFFont): Set<number> {
  let set = charsetCache.get(font);
  if (!set) {
    set = new Set(font.getCharacterSet());
    charsetCache.set(font, set);
  }
  return set;
}
function withoutMissingGlyphs(text: string, hebrewFont: PDFFont, latinFont: PDFFont): string {
  const fonts = [drawable(hebrewFont), drawable(latinFont)];
  const kept = [...text].filter((ch) => /\s/.test(ch) || fonts.some((f) => f.has(ch.codePointAt(0)!)));
  if (kept.length === [...text].length) return text;
  return kept.join("").replace(/\s{2,}/g, " ").trim();
}

function layoutVisualRuns(text: string, hebrewFont: PDFFont, latinFont: PDFFont, size: number) {
  // Runs are reordered right-to-left overall (the last logical run — e.g. the end of a Hebrew
  // sentence — is drawn leftmost), but each run's OWN characters stay in logical (unreversed)
  // order — pdf-lib's drawText shapes a same-font Hebrew run correctly on its own via fontkit's
  // internal bidi reordering (see segmentsByGlyphCoverage's own comment for the proof). A segment
  // with no Hebrew in it isn't reversed by fontkit, so it's reversed here.
  const visualRuns = visualRunsOf(withoutMissingGlyphs(text, hebrewFont, latinFont)).flatMap((r) =>
    r.rtl
      ? segmentsByGlyphCoverage(r.text, hebrewFont, latinFont).map((sg) =>
          HEBREW_RANGE.test(sg.text) ? sg : { ...sg, text: [...sg.text].reverse().join("") }
        )
      : [{ text: r.text, font: latinFont }]
  );
  const widths = visualRuns.map((r) => r.font.widthOfTextAtSize(r.text, size));
  return { visualRuns, widths, totalWidth: widths.reduce((a, b) => a + b, 0) };
}

// Lays out mixed Hebrew/Latin text as it would visually appear in an RTL paragraph: runs are
// ordered right-to-left overall, each run's own characters stay in logical order (fontkit shapes
// same-font Hebrew runs correctly on its own), Latin/digit runs also keep their natural order.
// Centers the whole line around `centerX`.
export function drawCenteredBidiText(
  page: PDFPage,
  text: string,
  opts: { centerX: number; y: number; size: number; hebrewFont: PDFFont; latinFont: PDFFont; color: RGB }
) {
  const { visualRuns, widths, totalWidth } = layoutVisualRuns(text, opts.hebrewFont, opts.latinFont, opts.size);
  let cursorX = opts.centerX - totalWidth / 2;
  visualRuns.forEach((r, i) => {
    page.drawText(r.text, { x: cursorX, y: opts.y, size: opts.size, font: r.font, color: opts.color });
    cursorX += widths[i];
  });
}

// Same bidi run layout as drawCenteredBidiText, but anchored within an arbitrary box via a CSS
// text-align-like `align` — "right"/"left" here mean the text block's edge, not reading direction
// (a right-aligned line still lays out its internal runs the same bidi-correct way).
export function drawAlignedBidiText(
  page: PDFPage,
  text: string,
  opts: { boxX: number; boxWidth: number; y: number; size: number; align: "left" | "center" | "right"; hebrewFont: PDFFont; latinFont: PDFFont; color: RGB; opacity?: number }
) {
  const { visualRuns, widths, totalWidth } = layoutVisualRuns(text, opts.hebrewFont, opts.latinFont, opts.size);
  const startX =
    opts.align === "left" ? opts.boxX : opts.align === "right" ? opts.boxX + opts.boxWidth - totalWidth : opts.boxX + (opts.boxWidth - totalWidth) / 2;
  let cursorX = startX;
  visualRuns.forEach((r, i) => {
    page.drawText(r.text, { x: cursorX, y: opts.y, size: opts.size, font: r.font, color: opts.color, ...(opts.opacity !== undefined ? { opacity: opts.opacity } : {}) });
    cursorX += widths[i];
  });
}
