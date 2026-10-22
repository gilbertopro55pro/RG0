import type { FrameOrientation, MagnetFrameSettings, MagnetFrameSizeKey } from "@/lib/types";

// Plain constants shared by the server-side raster export (magnetFrame.ts, which imports sharp and
// so can never load in a client component) and the browser canvas editor (MagnetFrameEditor.tsx) —
// both need to agree on exactly where the mat/photo-cutout line falls.

// Print sizes (owner, 2026-10-22): the 20×15 frame the tool started with, the 7.5×10 magnet itself,
// and the sizes magnet-printing software uses (10×15, 10×7, 9×9). widthCm × heightCm is the
// landscape frame; the portrait frame swaps them. A square size has one frame only.
export const MAGNET_FRAME_SIZES: { key: MagnetFrameSizeKey; widthCm: number; heightCm: number; label: string }[] = [
  { key: "20x15", widthCm: 20, heightCm: 15, label: "20×15" },
  { key: "10x7.5", widthCm: 10, heightCm: 7.5, label: "10×7.5" },
  { key: "15x10", widthCm: 15, heightCm: 10, label: "15×10" },
  { key: "10x7", widthCm: 10, heightCm: 7, label: "10×7" },
  { key: "9x9", widthCm: 9, heightCm: 9, label: "9×9" },
];
export const DEFAULT_MAGNET_SIZE: MagnetFrameSizeKey = "20x15";

export function magnetSize(key: MagnetFrameSizeKey | null | undefined) {
  return MAGNET_FRAME_SIZES.find((s) => s.key === key) ?? MAGNET_FRAME_SIZES[0];
}

export function isSquareMagnetSize(key: MagnetFrameSizeKey | null | undefined): boolean {
  const s = magnetSize(key);
  return s.widthCm === s.heightCm;
}

// The size as it reads for one orientation: "20×15" landscape, "15×20" portrait.
export function magnetSizeLabel(key: MagnetFrameSizeKey | null | undefined, orientation: FrameOrientation): string {
  const s = magnetSize(key);
  const fmt = (n: number) => String(n);
  return orientation === "landscape" ? `${fmt(s.widthCm)}×${fmt(s.heightCm)}` : `${fmt(s.heightCm)}×${fmt(s.widthCm)}`;
}

// DESIGN units: every frame's long side is 1600 px, whatever its print size, so a design keeps its
// proportions when its size changes and every pixel-sized setting (font sizes, shadows, outlines,
// texture tiles) means the same share of the frame. The 20×15 frame is 1600×1200, as it always was.
export const MAGNET_DESIGN_LONG_SIDE = 1600;

export function magnetDesignDimensions(orientation: FrameOrientation, key: MagnetFrameSizeKey | null | undefined): { widthPx: number; heightPx: number } {
  const s = magnetSize(key);
  const shortPx = Math.round((MAGNET_DESIGN_LONG_SIDE * Math.min(s.widthCm, s.heightCm)) / Math.max(s.widthCm, s.heightCm));
  const wide = s.widthCm >= s.heightCm;
  // Landscape: the long side across (for a wide size). Portrait: swapped. Square: both 1600.
  const landscape = wide ? { widthPx: MAGNET_DESIGN_LONG_SIDE, heightPx: shortPx } : { widthPx: shortPx, heightPx: MAGNET_DESIGN_LONG_SIDE };
  return orientation === "landscape" ? landscape : { widthPx: landscape.heightPx, heightPx: landscape.widthPx };
}

// The 20×15 frame's design dimensions (the only size before 2026-10-22).
export const MAGNET_FRAME_DIMENSIONS: Record<FrameOrientation, { widthPx: number; heightPx: number }> = {
  landscape: magnetDesignDimensions("landscape", "20x15"),
  portrait: magnetDesignDimensions("portrait", "20x15"),
};

// The export renders the design at print resolution: 300 DPI at the size's real centimeters, and
// stamped with that DPI so print shops and Photoshop open it at its real size. Every design-px
// value is multiplied by magnetExportScale (≈1.476 for 20×15, which comes out 2362×1772).
export const MAGNET_FRAME_DPI = 300;

export function magnetExportDimensions(orientation: FrameOrientation, key: MagnetFrameSizeKey | null | undefined): { widthPx: number; heightPx: number } {
  const s = magnetSize(key);
  const w = Math.round((s.widthCm / 2.54) * MAGNET_FRAME_DPI);
  const h = Math.round((s.heightCm / 2.54) * MAGNET_FRAME_DPI);
  return orientation === "landscape" ? { widthPx: w, heightPx: h } : { widthPx: h, heightPx: w };
}

export function magnetExportScale(key: MagnetFrameSizeKey | null | undefined): number {
  const s = magnetSize(key);
  return ((Math.max(s.widthCm, s.heightCm) / 2.54) * MAGNET_FRAME_DPI) / MAGNET_DESIGN_LONG_SIDE;
}

// The 20×15 frame's scale, as the export used before sizes existed.
export const MAGNET_EXPORT_SCALE = magnetExportScale("20x15");

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
  sizeKey: DEFAULT_MAGNET_SIZE,
};

// The mat border is a FIXED pixel width (a % of the canvas's shorter side) on top/left/right, and
// an INDEPENDENT fixed pixel width on the bottom edge only (bottomBorderRatioPct — a classic
// "bottom-weighted mat" look) — so as a percentage of each axis these differ not just between the
// wide and tall edges of a non-square canvas, but also between the top and bottom edges of the
// SAME canvas. This is what draws the photo-cutout placeholder in the editor at exactly the same
// lines the server export actually punches transparent.
export function getMatInsetPct(
  orientation: FrameOrientation,
  key: MagnetFrameSizeKey | null | undefined,
  borderRatioPct: number,
  bottomBorderRatioPct: number
): { xPct: number; topPct: number; bottomPct: number } {
  const { widthPx, heightPx } = magnetDesignDimensions(orientation, key);
  const shorterSide = Math.min(widthPx, heightPx);
  const borderPx = Math.round((borderRatioPct / 100) * shorterSide);
  const bottomBorderPx = Math.round((bottomBorderRatioPct / 100) * shorterSide);
  return { xPct: (borderPx / widthPx) * 100, topPct: (borderPx / heightPx) * 100, bottomPct: (bottomBorderPx / heightPx) * 100 };
}

// The inner cutout's own CSS border-radius, in px, for the live editor preview — mirrors the
// clamp-to-half-the-cutout's-shorter-side logic renderMagnetFrameBase uses server-side, so the
// on-screen preview and the exported file round the corner by the exact same amount.
export function getCutoutRadiusPx(orientation: FrameOrientation, settings: MagnetFrameSettings, displayWidthPx: number): number {
  const { widthPx, heightPx } = magnetDesignDimensions(orientation, settings.sizeKey);
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

// The text effects, in design px, shared by the editor's CSS and the export: the shadow (offset
// both ways, blur, color at 55%), the outline outside the letters, and the letter spacing.
export const MAGNET_TEXT_SHADOW_ALPHA = 0.55;

export function hexToRgbTriple(hex: string | undefined, fallback: [number, number, number] = [0, 0, 0]): [number, number, number] {
  const h = (hex ?? "").replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) return fallback;
  return [parseInt(full.slice(0, 2), 16), parseInt(full.slice(2, 4), 16), parseInt(full.slice(4, 6), 16)];
}

export function magnetTextShadowRgba(color: string | undefined): string {
  return `rgba(${hexToRgbTriple(color).join(",")},${MAGNET_TEXT_SHADOW_ALPHA})`;
}

// Sizes a text element can take, in design px.
export const MAGNET_TEXT_SIZE_RANGE = { min: 10, max: 320 };
export const MAGNET_DECORATION_SIZE_RANGE = { min: 3, max: 90 };

// How far inside the frame's edges text is safe from the printer's margin and the cut: 3 mm.
export const MAGNET_SAFE_MARGIN_CM = 0.3;
export function magnetSafeMarginPct(orientation: FrameOrientation, key: MagnetFrameSizeKey | null | undefined): { xPct: number; yPct: number } {
  const s = magnetSize(key);
  const wCm = orientation === "landscape" ? s.widthCm : s.heightCm;
  const hCm = orientation === "landscape" ? s.heightCm : s.widthCm;
  return { xPct: (MAGNET_SAFE_MARGIN_CM / wCm) * 100, yPct: (MAGNET_SAFE_MARGIN_CM / hCm) * 100 };
}
