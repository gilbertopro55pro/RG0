import type { AlbumElement, AlbumFrame } from "@/lib/types";

// The print-safe margin is a hard constraint for anything placed AUTOMATICALLY (templates, the
// multi-photo auto-layout) — every frame designed on a nominal 0-100 full-bleed canvas gets
// linearly rescaled into the album's actual safe-print box, so no automatically-generated layout
// can ever cross the green line regardless of which album size it's applied to. Manual dragging is
// deliberately NOT clamped by this — a photographer can always drag a photo past the margin on
// purpose; only automatic placement is constrained.
export function marginInsetPctFor(album: { width_cm: number; height_cm: number; safe_margin_cm?: number }): { x: number; y: number } | null {
  const marginCm = album.safe_margin_cm ?? 0.5;
  return album.width_cm > 0 && album.height_cm > 0 ? { x: (marginCm / album.width_cm) * 100, y: (marginCm / album.height_cm) * 100 } : null;
}

export function fitFramesToSafeArea(frames: AlbumFrame[], marginInsetPct: { x: number; y: number } | null): AlbumFrame[] {
  if (!marginInsetPct) return frames;
  const { x: mx, y: my } = marginInsetPct;
  const safeWidth = 100 - 2 * mx;
  const safeHeight = 100 - 2 * my;
  if (safeWidth <= 0 || safeHeight <= 0) return frames;
  return frames.map((f) => ({
    ...f,
    xPct: mx + (f.xPct / 100) * safeWidth,
    yPct: my + (f.yPct / 100) * safeHeight,
    widthPct: (f.widthPct / 100) * safeWidth,
    heightPct: (f.heightPct / 100) * safeHeight,
  }));
}

// Auto album design: bleed elements (a full half-page photo, a full cover photo) run to the page
// edge on purpose, so they're left as laid out; everything else is pulled into the safe margin.
export function fitAutoElements(elements: AlbumElement[], inset: { x: number; y: number } | null, bleedIds: string[] = []): AlbumElement[] {
  if (!inset) return elements;
  const safeW = 100 - 2 * inset.x;
  const safeH = 100 - 2 * inset.y;
  if (safeW <= 0 || safeH <= 0) return elements;
  const bleed = new Set(bleedIds);
  return elements.map((el) =>
    bleed.has(el.id)
      ? el
      : {
          ...el,
          xPct: inset.x + (el.xPct / 100) * safeW,
          yPct: inset.y + (el.yPct / 100) * safeH,
          widthPct: (el.widthPct / 100) * safeW,
          ...(el.heightPct !== undefined ? { heightPct: (el.heightPct / 100) * safeH } : {}),
        }
  ) as AlbumElement[];
}
