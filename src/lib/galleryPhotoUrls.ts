import { optimizedImageUrl } from "@/lib/imageOptimize";

// Where a gallery photo's `url` (the original file) points in the browser (2026-10-24, speed for
// large galleries). The gallery pages used to presign every original on every load: ~2.8 s of
// server CPU and ~3 MB of page for a 5,382-photo gallery, for URLs that are almost never opened
// (the screen shows the previews). Now `url` is a short, stable same-origin route that checks
// access and signs only the one photo that's actually opened, on the click.
// The photographer's screen only: /api/galleries/<gallery>/photos/<photo>/original (the session).
// The client's gallery page still signs its originals itself (its share-link and web-quality rules).

// The signed URL the redirect points to, and how long the browser may reuse the redirect itself:
// shorter, so a cached redirect never leads to an expired signature.
export const ORIGINAL_SIGNED_SECONDS = 3600;
export const ORIGINAL_REDIRECT_CACHE_SECONDS = 3000;

export function photographerOriginalUrl(galleryId: string, photoId: string): string {
  return `/api/galleries/${galleryId}/photos/${photoId}/original`;
}

// The photographer's server-resized copy (600-2000px, the route clamps it).
export function photographerImageUrl(galleryId: string, photoId: string, size: number): string {
  return `/api/galleries/${galleryId}/photos/${photoId}/image?size=${Math.round(size)}`;
}

const PHOTOGRAPHER_ORIGINAL_RE = /^\/api\/galleries\/([^/?#]+)\/photos\/([^/?#]+)\/original$/;

// A resized copy of a photo for the screen (a thumbnail, the slideshow, a cover, an album page),
// never the original: the photo's preview when it has one. Without one, the server-resized copy
// behind the original route above; the image optimizer can't fetch that route (it has no session,
// and optimizedImageUrl passes /api/ URLs through unchanged), so it would load the whole camera file.
// Anything else (a signed URL, a local blob: of a photo being uploaded) goes as before.
export function resizedPhotoUrl(photo: { url: string; previewUrl?: string | null }, width: number): string {
  if (photo.previewUrl) return photo.previewUrl;
  const own = PHOTOGRAPHER_ORIGINAL_RE.exec(photo.url);
  if (own) return photographerImageUrl(own[1], own[2], width);
  return optimizedImageUrl(photo.url, width);
}
