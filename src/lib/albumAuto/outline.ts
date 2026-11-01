import type { AlbumElement } from "@/lib/types";

// The outline around the album's photos, chosen in the auto designer (owner, 2026-11-01: "אפשרות
// לבחירת קו מתאר (צבע ועובי) לתמונות"). null keeps each style's own (black 3px in clean, white in
// the others, the photographer's templates their own). Otherwise every framed photo of the album,
// the cover's included, takes this width and colour, and width 0 leaves none. Photos that run to the
// page's edge on purpose (the page's bleeds) and faded photos stay without an outline, as the
// editor's "החלה על כל דפי האלבום" leaves edge-to-edge photos frameless.

export type AutoOutline = { width: number; color: string } | null;

export const AUTO_OUTLINE_MAX = 20;
export const AUTO_OUTLINE_DEFAULT = { width: 3, color: "#000000" } as const;

export function clampOutlineWidth(v: number): number {
  return Number.isFinite(v) ? Math.max(0, Math.min(AUTO_OUTLINE_MAX, Math.round(v))) : AUTO_OUTLINE_DEFAULT.width;
}

export function withAutoOutline(elements: readonly AlbumElement[], bleedIds: readonly string[], outline: AutoOutline): AlbumElement[] {
  if (!outline) return [...elements];
  const bleed = new Set(bleedIds);
  const width = clampOutlineWidth(outline.width);
  return elements.map((el) => {
    if (el.type !== "photo" || bleed.has(el.id) || el.maskId?.startsWith("fade")) return el;
    if (width === 0) {
      const out = { ...el };
      delete out.borderWidth;
      delete out.borderColor;
      return out;
    }
    return { ...el, borderWidth: width, borderColor: outline.color };
  });
}
