"use client";

import type { CSSProperties } from "react";

// Thumbnails already shown on this page, by photo id: they appear at once when the grid redraws or
// a tab is opened again, instead of fading in again.
const shownThumbs = new Set<string>();

// A grid thumbnail. It loads when it gets near the screen, and fades in on its own as it arrives.
// The grid used to keep every thumbnail hidden until all of them had loaded, and loaded all of them
// at once: thousands in a big gallery before anything showed (owner, 2026-10-17).
export function GridThumb({
  photoId,
  src,
  alt,
  className,
  style,
  fade = true,
  onLoaded,
}: {
  photoId: string;
  src: string;
  alt: string;
  className: string;
  style?: CSSProperties;
  fade?: boolean;
  onLoaded?: (img: HTMLImageElement) => void;
}) {
  const show = (img: HTMLImageElement) => {
    shownThumbs.add(photoId);
    img.style.opacity = "1";
  };
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      ref={(img) => {
        // Already in the browser's cache: complete before React could listen for its load.
        if (img && img.complete && img.naturalWidth > 0 && !shownThumbs.has(photoId)) show(img);
      }}
      src={src}
      alt={alt}
      loading="lazy"
      decoding="async"
      className={className}
      style={{ opacity: !fade || shownThumbs.has(photoId) ? 1 : 0, ...style }}
      onLoad={(e) => {
        show(e.currentTarget);
        onLoaded?.(e.currentTarget);
      }}
      onError={(e) => show(e.currentTarget)}
    />
  );
}
