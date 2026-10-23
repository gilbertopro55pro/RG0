// Shared between AlbumSpreadCanvasEditor.tsx (live CSS box) and every export renderer
// (albumRaster.ts's svgTextLayer, reused by albumPsd.ts; albumPdf.ts's drawTextElement) — all of
// them vertically CENTER a text element within its own xPct/yPct/widthPct/heightPct box, so the
// one thing that must never happen is this formula drifting into two different copies that
// disagree (that's exactly how the box-height/font-size mismatch this file fixes first got in).
export const TEXT_LINE_HEIGHT_FACTOR = 1.4;

export function textHeightPctForFontSize(fontSize: number, album: { width_cm: number; height_cm: number }): number {
  const fontSizePctOfWidth = (fontSize / 1600) * 100;
  const aspectWtoH = album.height_cm > 0 ? album.width_cm / album.height_cm : 1;
  return Math.min(90, fontSizePctOfWidth * aspectWtoH * TEXT_LINE_HEIGHT_FACTOR);
}

// How far a text box's saved height is allowed to exceed what its OWN font size actually needs.
// Both the editor and every exporter center text within whatever heightPct is stored, so once a
// box's height and its font size drift far apart (confirmed in production: a box saved at one
// font size, whose font was later shrunk a lot without ever shrinking the box back down), the
// centered text visually sinks deep into the oversized box, away from wherever it was placed. 3x
// is generous enough to leave a real, deliberately-enlarged box alone (the one confirmed-correct
// production case sat at 1.7x oversize) while bounding the worst real case actually found (6.6x)
// down to a barely-noticeable effect.
export const MAX_TEXT_HEIGHT_OVERSIZE_RATIO = 3;

// ── Lines ────────────────────────────────────────────────────────────────────────────────────
// A text breaks into lines only where the photographer pressed Shift+Enter (owner, 2026-10-23: a
// long text wrapped into two lines in the editor and came out as one line in every export). The
// editor, the thumbnails and the client's page show it with `white-space: pre` and never wrap it by
// width; the JPG, PSD and PDF draw the same lines, this far apart (in font sizes). The lines sit
// as one block centered in the box, each aligned in the box's width, so a one-line text lands
// exactly where it always has.
export const ALBUM_TEXT_LINE_HEIGHT = 1.2;

export function albumTextLines(text: string): string[] {
  return text.replace(/\r\n?/g, "\n").split("\n");
}

// A line with any Hebrew in it reads right to left, as the exports lay it out (visualRunsOf).
const HEBREW = /[֐-׿]/;
export function albumLineDir(line: string): "rtl" | "ltr" {
  return HEBREW.test(line) ? "rtl" : "ltr";
}

// Each line's baseline below the box's vertical middle (negative = above it). CSS's line box: the
// block of n lines is centered, and a line's baseline sits half its leading plus the ascent below
// the line's top. With one line this is (ascent - descent) / 2, the formula every export used.
export function albumLineBaselines(lineCount: number, fontSizePx: number, ascentPx: number, descentPx: number): number[] {
  const lineHeight = ALBUM_TEXT_LINE_HEIGHT * fontSizePx;
  return Array.from({ length: Math.max(1, lineCount) }, (_, i) => (i - (Math.max(1, lineCount) - 1) / 2) * lineHeight + (ascentPx - descentPx) / 2);
}

// The box height a text of this many lines needs: one line as textHeightPctForFontSize, and one
// line height more for each line after it.
export function textHeightPctForLines(fontSize: number, album: { width_cm: number; height_cm: number }, lineCount: number): number {
  const oneLine = textHeightPctForFontSize(fontSize, album);
  if (lineCount <= 1) return oneLine;
  return Math.min(90, (oneLine * (TEXT_LINE_HEIGHT_FACTOR + (lineCount - 1) * ALBUM_TEXT_LINE_HEIGHT)) / TEXT_LINE_HEIGHT_FACTOR);
}

// A box too short for its text's lines grows to fit them, about its middle, so the text (centered
// in the box everywhere) stays where it is on the page. Never shrinks a box. Null = no change.
export function grownTextBox(
  el: { yPct: number; heightPct?: number; fontSize: number },
  text: string,
  album: { width_cm: number; height_cm: number }
): { yPct: number; heightPct: number } | null {
  const height = el.heightPct ?? 15;
  const needed = textHeightPctForLines(el.fontSize, album, albumTextLines(text).length);
  if (needed <= height + 0.01) return null;
  return { yPct: el.yPct - (needed - height) / 2, heightPct: needed };
}
