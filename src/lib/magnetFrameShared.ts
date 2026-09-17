import type { FrameOrientation, MagnetFrameSettings } from "@/lib/types";

// Plain constants shared by the server-side raster export (magnetFrame.ts, which imports sharp and
// so can never load in a client component) and the browser canvas editor (MagnetFrameEditor.tsx) —
// both need to agree on exactly where the mat/photo-cutout line falls.

// Real-world 20x15cm / 15x20cm at 80px/cm.
export const MAGNET_FRAME_DIMENSIONS: Record<FrameOrientation, { widthPx: number; heightPx: number }> = {
  landscape: { widthPx: 1600, heightPx: 1200 },
  portrait: { widthPx: 1200, heightPx: 1600 },
};

export const DEFAULT_MAGNET_FRAME_SETTINGS: MagnetFrameSettings = {
  borderRatioPct: 12,
  bottomBorderRatioPct: 12,
  cornerRadiusPct: 0,
  frameColor: "#ffffff",
  frameColorOpacity: 0,
  shadowEnabled: true,
  shadowOpacity: 28,
  shadowBlurPx: 24,
  shadowDistancePx: 10,
  textureId: null,
  textureOpacity: 40,
  customTextureAssetId: null,
};

// The mat border is a FIXED pixel width (a % of the canvas's shorter side) on top/left/right, and
// an INDEPENDENT fixed pixel width on the bottom edge only (bottomBorderRatioPct — a classic
// "bottom-weighted mat" look) — so as a percentage of each axis these differ not just between the
// wide and tall edges of a non-square canvas, but also between the top and bottom edges of the
// SAME canvas. This is what draws the photo-cutout placeholder in the editor at exactly the same
// lines the server export actually punches transparent.
export function getMatInsetPct(orientation: FrameOrientation, borderRatioPct: number, bottomBorderRatioPct: number): { xPct: number; topPct: number; bottomPct: number } {
  const { widthPx, heightPx } = MAGNET_FRAME_DIMENSIONS[orientation];
  const shorterSide = Math.min(widthPx, heightPx);
  const borderPx = Math.round((borderRatioPct / 100) * shorterSide);
  const bottomBorderPx = Math.round((bottomBorderRatioPct / 100) * shorterSide);
  return { xPct: (borderPx / widthPx) * 100, topPct: (borderPx / heightPx) * 100, bottomPct: (bottomBorderPx / heightPx) * 100 };
}

// The inner cutout's own CSS border-radius, in px, for the live editor preview — mirrors the
// clamp-to-half-the-cutout's-shorter-side logic renderMagnetFrameBase uses server-side, so the
// on-screen preview and the exported file round the corner by the exact same amount.
export function getCutoutRadiusPx(orientation: FrameOrientation, settings: MagnetFrameSettings, displayWidthPx: number): number {
  const { widthPx, heightPx } = MAGNET_FRAME_DIMENSIONS[orientation];
  const scale = displayWidthPx > 0 ? displayWidthPx / widthPx : 0;
  const shorterSide = Math.min(widthPx, heightPx);
  const borderPx = (settings.borderRatioPct / 100) * shorterSide;
  const bottomBorderPx = (settings.bottomBorderRatioPct / 100) * shorterSide;
  const cutoutW = widthPx - borderPx * 2;
  const cutoutH = heightPx - borderPx - bottomBorderPx;
  const maxRadius = Math.min(cutoutW, cutoutH) / 2;
  const radius = Math.min(maxRadius, (settings.cornerRadiusPct / 100) * maxRadius);
  return radius * scale;
}
