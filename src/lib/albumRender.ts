import { hasAdjustments, adjustmentsFilterId, type PhotoAdjustments } from "@/lib/albumAdjustments";
import type { AlbumPhotoFilter } from "@/lib/types";

// Shared, pure rendering helpers for one album spread's photo/mask/shadow compositing math — used
// by the interactive canvas editor (AlbumSpreadCanvasEditor.tsx), the read-only spread thumbnail
// (AlbumSpreadThumbnail.tsx), and the client-facing proofing view (GalleryAlbumProofing.tsx).
// Deliberately its own module (not defined inside any one of those components) so none of them has
// to import from another — that would create a circular dependency between components that both
// need to import each other.

export type PhotoWithUrl = { id: string; url: string; previewUrl?: string | null; is_favorite?: boolean; folder_id?: string | null };

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
  adjust?: { id: string; adj: PhotoAdjustments }
): string | undefined {
  const parts: string[] = [];
  if (filter === "bw") parts.push("grayscale(1)");
  else if (filter === "sepia") parts.push("sepia(0.85)");
  if (blurPct) parts.push(`blur(${(blurPct / 100) * ALBUM_BLUR_MAX_PX}px)`);
  if (adjust && hasAdjustments(adjust.adj)) parts.push(`url(#${adjustmentsFilterId(adjust.id, adjust.adj)})`);
  return parts.length ? parts.join(" ") : undefined;
}

// box-shadow (unlike filter: drop-shadow on a descendant) isn't clipped by the frame's own
// overflow-hidden, so it's the one that can actually bleed outside a cropped photo frame.
export function boxShadowFor(shadowPct: number | undefined): string | undefined {
  if (!shadowPct) return undefined;
  const blurPx = (shadowPct / 100) * 24;
  const offsetPx = (shadowPct / 100) * 10;
  const alpha = 0.15 + (shadowPct / 100) * 0.45;
  return `${offsetPx}px ${offsetPx}px ${blurPx}px rgba(0,0,0,${alpha})`;
}
