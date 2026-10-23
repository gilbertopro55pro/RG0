// The turn of an album text element (AlbumTextElement.rotation): clockwise degrees around the
// center of its box, the whole text with its shadow and outline, like the editor's CSS
// `transform: rotate()` on the box. Shared by the CSS renderers (thumbnails, client proofing) and
// the quality check, so they agree on what counts as turned; the JPG/PSD (albumRaster.ts) and PDF
// (albumPdf.ts) renderers apply the same turn in their own primitives.

// The turn to draw, 0 when missing or not a number (a bad value must never hide the text).
export function textRotationDeg(el: { rotation?: number }): number {
  const r = el.rotation;
  return typeof r === "number" && Number.isFinite(r) ? r : 0;
}

// The CSS transform for a text box, undefined when upright so an unturned text renders exactly as
// before. The origin is the box's own center (the CSS default), which is the pivot every export uses.
export function textRotationTransform(el: { rotation?: number }): string | undefined {
  const deg = textRotationDeg(el);
  return deg ? `rotate(${deg}deg)` : undefined;
}

// The axis-aligned bounds of a box turned `deg` clockwise (screen axes, y down) around a pivot.
// The coordinates must be in one physical unit on both axes: a turn in % of a non-square page
// would skew the box.
export function rotatedBounds(
  box: { x0: number; y0: number; x1: number; y1: number },
  pivot: { x: number; y: number },
  deg: number
): { x0: number; y0: number; x1: number; y1: number } {
  if (!deg) return box;
  const rad = (deg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const corners: [number, number][] = [
    [box.x0, box.y0],
    [box.x1, box.y0],
    [box.x1, box.y1],
    [box.x0, box.y1],
  ];
  // With y down, this matrix turns clockwise on screen, as CSS rotate() does.
  const turned = corners.map(([x, y]) => {
    const dx = x - pivot.x;
    const dy = y - pivot.y;
    return [pivot.x + dx * cos - dy * sin, pivot.y + dx * sin + dy * cos] as const;
  });
  const xs = turned.map((p) => p[0]);
  const ys = turned.map((p) => p[1]);
  return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
}
