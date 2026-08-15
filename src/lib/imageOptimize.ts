// Routes a (typically full-resolution, multi-MB) signed Storage URL through Next's own image
// optimizer as a plain query-string URL — for spots like the masonry mosaic and the lightbox
// where next/image's <Image> component doesn't fit cleanly (masonry needs the image's natural
// aspect ratio, not a fixed fill container), but the same server-side resize/recompress win
// still applies. Requires the source host to be in next.config.ts's images.remotePatterns.
// Vercel's production image optimizer only accepts q=75 unless images.qualities is explicitly
// configured in next.config.ts (confirmed empirically — other values 400) — width is what
// actually does the heavy lifting for file size here anyway (640px vs. a multi-MB original).
export function optimizedImageUrl(url: string, width: number, quality = 75): string {
  // blob:/data: URLs only exist in this browser tab's memory — the server-side optimizer can't
  // fetch them (that 404s), so a freshly-uploaded photo's local preview must bypass it entirely.
  // It's already a local, unoptimized-but-small preview anyway; the real optimized URL kicks in
  // once the page reloads and gets the actual signed storage URL from the server.
  if (url.startsWith("blob:") || url.startsWith("data:")) return url;
  return `/_next/image?url=${encodeURIComponent(url)}&w=${width}&q=${quality}`;
}
