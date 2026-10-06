import { hasAdjustments, adjustmentsFilterId, type PhotoAdjustments } from "@/lib/albumAdjustments";
import { sharpenFilterId } from "@/lib/albumSharpen";
import type { AlbumPhotoFilter } from "@/lib/types";
import { isLightTextColor } from "@/lib/textColor";

// Shared, pure rendering helpers for one album spread's photo/mask/shadow compositing math — used
// by the interactive canvas editor (AlbumSpreadCanvasEditor.tsx), the read-only spread thumbnail
// (AlbumSpreadThumbnail.tsx), and the client-facing proofing view (GalleryAlbumProofing.tsx).
// Deliberately its own module (not defined inside any one of those components) so none of them has
// to import from another — that would create a circular dependency between components that both
// need to import each other.

export type PhotoWithUrl = {
  id: string;
  url: string;
  previewUrl?: string | null;
  is_favorite?: boolean;
  folder_id?: string | null;
  // Optional — present when the caller's own richer photo row (e.g. GalleryManageView's own
  // PhotoWithUrl, a GalleryPhotoRow superset) is passed straight through. Used to sort the
  // favorites/drag-panel list by name or upload date — see AlbumSpreadCanvasEditor's own
  // dragPanelSort.
  original_filename?: string | null;
  created_at?: string;
};

// A shared cap so a given blur % looks (and exports) the same whether it's applied to a framed
// photo or the full-page background — also the sigma sharp/PDF baking uses server-side, since
// CSS blur(px) and sharp's Gaussian blur sigma are both "pixels of std-deviation" and line up
// closely enough in practice not to need a separate conversion factor.
export const ALBUM_BLUR_MAX_PX = 40;

// Replaces `object-fit:cover` + `object-position` + `transform:scale()` for a zoomed/panned photo.
// That combo looks right at first but has a real bug: object-position's pan range is computed from
// the UNZOOMED cover-fit image, so an axis with zero baseline crop slack (e.g. a landscape photo
// exactly filling a landscape frame's height) never gains panning room even after zooming in, since
// the browser scales the already-decided crop uniformly instead of revealing more of the source.
// This computes the photo's rendered size/position (all as % of the frame) directly: cover-fit the
// frame first, then apply the extra zoom to THAT, THEN resolve the focal point against the
// now-larger canvas — so panning range in both axes grows correctly with zoom. Mirrored server-side
// in `coverCropRaw` (albumRaster.ts) so exports match the editor exactly.
export function computePhotoFraming(imgAspect: number, frameAspect: number, zoomPct: number, focalXPct: number, focalYPct: number) {
  const zf = zoomPct && zoomPct > 100 ? zoomPct / 100 : 1;
  const coverWidthPct = imgAspect >= frameAspect ? 100 * (imgAspect / frameAspect) : 100;
  const coverHeightPct = imgAspect >= frameAspect ? 100 : 100 * (frameAspect / imgAspect);
  const widthPct = coverWidthPct * zf;
  const heightPct = coverHeightPct * zf;
  const leftPct = -(widthPct - 100) * (focalXPct / 100);
  const topPct = -(heightPct - 100) * (focalYPct / 100);
  return { widthPct, heightPct, leftPct, topPct };
}

export function cssFilterFor(
  filter: AlbumPhotoFilter | undefined,
  blurPct: number | undefined,
  adjust?: { id: string; adj: PhotoAdjustments },
  sharpness?: number
): string | undefined {
  const parts: string[] = [];
  if (filter === "bw") parts.push("grayscale(1)");
  else if (filter === "sepia") parts.push("sepia(0.85)");
  if (blurPct) parts.push(`blur(${(blurPct / 100) * ALBUM_BLUR_MAX_PX}px)`);
  if (adjust && hasAdjustments(adjust.adj)) parts.push(`url(#${adjustmentsFilterId(adjust.id, adjust.adj)})`);
  if (adjust && sharpness) parts.push(`url(#${sharpenFilterId(adjust.id, sharpness)})`);
  return parts.length ? parts.join(" ") : undefined;
}

// box-shadow (unlike filter: drop-shadow on a descendant) isn't clipped by the frame's own
// overflow-hidden, so it's the one that can actually bleed outside a cropped photo frame.
// distancePct/blurPct independently override the offset/softness that would otherwise be derived
// from shadowPct alone — undefined (the default, and every already-saved album) keeps the old
// coupled-to-intensity behavior exactly. shadowPct always still drives the shadow's alpha (and
// whether it renders at all).
//
// angleDeg: direction the shadow is cast, 0-360, screen convention (0=right, 90=down, 180=left,
// 270=up, clockwise). undefined defaults to 45 (down-right) — every shadow's fixed direction
// before this param existed, back when X and Y offset were both just `offsetPx` (a vector of
// magnitude offsetPx*sqrt(2) pointing down-right, not offsetPx itself) — so an already-designed
// album's shadow renders pixel-identical until a photographer explicitly drags the angle slider.
export function boxShadowFor(shadowPct: number | undefined, distancePct?: number, blurPct?: number, angleDeg?: number): string | undefined {
  if (!shadowPct) return undefined;
  const offsetPx = ((distancePct ?? shadowPct) / 100) * 10;
  const blurPx = ((blurPct ?? shadowPct) / 100) * 24;
  const alpha = 0.15 + (shadowPct / 100) * 0.45;
  const magnitude = offsetPx * Math.SQRT2;
  const angleRad = ((angleDeg ?? 45) * Math.PI) / 180;
  const offsetX = (magnitude * Math.cos(angleRad)).toFixed(2);
  const offsetY = (magnitude * Math.sin(angleRad)).toFixed(2);
  return `${offsetX}px ${offsetY}px ${blurPx}px rgba(0,0,0,${alpha})`;
}

// text-shadow (unlike box-shadow) accepts multiple comma-separated shadows on one property, so a
// drop shadow and an outer glow — genuinely different effects, a dark offset shadow for depth vs a
// soft white halo for legibility over a busy photo — stack as two separate entries in one value
// instead of needing two properties or two DOM layers.
// The text effects every renderer draws the same way (editor, client proofing, JPG/PSD/PDF), in
// points on the 1600pt reference canvas so they scale with the page like fontSize does. No shadow
// or glow set = the soft contrast shadow the editor always showed by default.
export type TextShadowSpec = { dx: number; dy: number; blur: number; rgb: [number, number, number]; alpha: number };
export function textShadowSpecs(el: { color: string; shadow?: number; glow?: number }): TextShadowSpec[] {
  const out: TextShadowSpec[] = [];
  if (el.shadow || el.glow) {
    if (el.shadow) {
      const s = el.shadow / 100;
      out.push({ dx: s * 6, dy: s * 6, blur: s * 15, rgb: [0, 0, 0], alpha: 0.2 + s * 0.5 });
    }
    if (el.glow) {
      const g = el.glow / 100;
      out.push({ dx: 0, dy: 0, blur: 3 + g * 27, rgb: [255, 255, 255], alpha: 0.35 + g * 0.55 });
    }
  } else {
    const light = isLightTextColor(el.color);
    out.push({ dx: 0, dy: 1.5, blur: 6, rgb: light ? [0, 0, 0] : [255, 255, 255], alpha: 0.7 });
  }
  return out;
}

// CSS for the same effects inside a container-query canvas (cqw = 1% of the canvas width).
export function textEffectsCss(el: { color: string; shadow?: number; glow?: number; strokeWidth?: number; strokeColor?: string }): {
  textShadow: string;
  WebkitTextStroke?: string;
  paintOrder?: string;
} {
  const u = (v: number) => `calc(${v.toFixed(2)} / 1600 * 100cqw)`;
  const textShadow = textShadowSpecs(el)
    .map((s) => `${u(s.dx)} ${u(s.dy)} ${u(s.blur)} rgba(${s.rgb.join(",")},${s.alpha.toFixed(3)})`)
    .join(", ");
  if (!el.strokeWidth) return { textShadow };
  // The stroke is centered on the letter edge; painting it under the fill shows only the outer half,
  // so it's drawn twice as wide to show strokeWidth outside the letters.
  return { textShadow, WebkitTextStroke: `${u(el.strokeWidth * 2)} ${el.strokeColor ?? "#000000"}`, paintOrder: "stroke fill" };
}

export function textShadowFor(shadowPct: number | undefined, glowPct: number | undefined): string | undefined {
  const parts: string[] = [];
  if (shadowPct) {
    const blurPx = (shadowPct / 100) * 10;
    const offsetPx = (shadowPct / 100) * 4;
    const alpha = 0.2 + (shadowPct / 100) * 0.5;
    parts.push(`${offsetPx}px ${offsetPx}px ${blurPx}px rgba(0,0,0,${alpha})`);
  }
  if (glowPct) {
    const blurPx = 2 + (glowPct / 100) * 18;
    const alpha = 0.35 + (glowPct / 100) * 0.55;
    parts.push(`0 0 ${blurPx}px rgba(255,255,255,${alpha})`);
  }
  return parts.length ? parts.join(", ") : undefined;
}
