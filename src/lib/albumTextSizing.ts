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
