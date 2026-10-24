// The galleries page (owner, 2026-10-24): a list or a grid of blocks, remembered on this device in a
// cookie so the server renders the chosen view straight away, with no jump after the page loads.
export type GalleriesView = "list" | "grid";

export const GALLERIES_VIEW_COOKIE = "galleries_view";

export function parseGalleriesView(value: string | undefined | null): GalleriesView {
  return value === "grid" ? "grid" : "list";
}

export function galleriesViewCookie(view: GalleriesView): string {
  return `${GALLERIES_VIEW_COOKIE}=${view}; path=/; max-age=31536000; samesite=lax`;
}

// The gallery's cover: the photo the photographer chose, else its first photo by order.
export function pickCoverPhoto<P extends { id: string; sort_order: number | null }>(coverPhotoId: string | null, photos: P[]): P | null {
  if (photos.length === 0) return null;
  const chosen = coverPhotoId ? photos.find((p) => p.id === coverPhotoId) : undefined;
  if (chosen) return chosen;
  return photos.reduce((first, p) => ((p.sort_order ?? Infinity) < (first.sort_order ?? Infinity) ? p : first), photos[0]);
}
