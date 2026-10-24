"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { optimizedImageUrl } from "@/lib/imageOptimize";
import {
  COVER_DISSOLVE_MS,
  COVER_ROTATION_INTERVAL_MS,
  coverOrientation,
  rotationForBox,
  type CoverOrientation,
  type CoverRotationPhoto,
} from "@/lib/galleryCoverRotation";

// The client gallery's rotating cover (2026-10-24): the photos take turns every 3 seconds, each new
// one dissolving in over the last. Fills its parent (absolute, inset 0). The first photo is the one in
// the page's HTML, so it shows at once as before. The next photo is fully loaded before it starts
// dissolving, nothing moves while the cover is off screen or the tab is hidden, and a device set to
// reduce motion keeps the first photo.
const WIDTHS = [828, 1200, 1920, 2048];

function srcSetOf(url: string): string | undefined {
  if (url.startsWith("blob:") || url.startsWith("data:")) return undefined;
  return WIDTHS.map((w) => `${optimizedImageUrl(url, w)} ${w}w`).join(", ");
}

function preload(url: string, sizes: string[]): Promise<void> {
  const srcSet = srcSetOf(url);
  return Promise.all(
    sizes.map((s) => {
      const img = new Image();
      if (srcSet) {
        img.sizes = s;
        img.srcset = srcSet;
      }
      img.src = url;
      return img.decode().catch(() => undefined);
    })
  ).then(() => undefined);
}

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export default function GalleryCoverRotator({
  photos,
  sizes,
  imgClassName,
  imgStyle,
  framed,
  fixedOrientation,
  priority,
}: {
  photos: CoverRotationPhoto[];
  sizes: string;
  // The first photo's own class (the premium cover's settle-in on load).
  imgClassName?: string;
  imgStyle?: CSSProperties;
  // A square/circle cover: the photo framed over a blurred copy of itself (GalleryPremiumCover).
  framed?: { style: CSSProperties; sizes: string } | null;
  // The shape that decides which photos fit, when it isn't the box's own (a framed square).
  fixedOrientation?: CoverOrientation;
  priority?: boolean;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [measured, setMeasured] = useState<CoverOrientation | null>(null);
  const orientation = fixedOrientation ?? measured;
  // Until the box is measured (and in the page's HTML), only the first photo.
  const list = useMemo(() => (orientation ? rotationForBox(photos, orientation) : photos.slice(0, 1)), [photos, orientation]);
  // `turns` counts the switches: the first photo's settle-in plays only on the page's first look.
  const [shown, setShown] = useState<{ top: number; under: number | null; turns: number }>({ top: 0, under: null, turns: 0 });
  const posRef = useRef(0);
  const framedSizes = framed?.sizes ?? null;

  useEffect(() => {
    if (fixedOrientation) return;
    const box = boxRef.current;
    if (!box) return;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      if (width > 0 && height > 0) setMeasured(coverOrientation(width / height));
    });
    ro.observe(box);
    return () => ro.disconnect();
  }, [fixedOrientation]);

  useEffect(() => {
    const box = boxRef.current;
    if (!box || list.length < 2) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let cancelled = false;
    let visible = true;
    const io = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
    });
    io.observe(box);
    const preloadSizes = framedSizes ? [sizes, framedSizes] : [sizes];
    (async () => {
      while (!cancelled) {
        const from = posRef.current % list.length;
        const next = (from + 1) % list.length;
        await Promise.all([preload(list[next].url, preloadSizes), wait(COVER_ROTATION_INTERVAL_MS)]);
        while (!cancelled && (!visible || document.hidden)) await wait(400);
        if (cancelled) return;
        posRef.current = next;
        setShown((s) => ({ top: next, under: from, turns: s.turns + 1 }));
      }
    })();
    return () => {
      cancelled = true;
      io.disconnect();
    };
  }, [list, sizes, framedSizes]);

  const top = shown.top % list.length;
  const under = shown.under == null ? null : shown.under % list.length;
  const layers = under == null || under === top ? [top] : [under, top];

  return (
    <div ref={boxRef} className="absolute inset-0" aria-hidden="true">
      <style>{`@keyframes gt-cover-dissolve { from { opacity: 0; } to { opacity: 1; } }`}</style>
      {layers.map((i, k) => {
        const p = list[i];
        const isTop = k === layers.length - 1;
        const srcSet = srcSetOf(p.url);
        const first = shown.turns === 0;
        const position = `${p.focalX}% ${p.focalY}%`;
        return (
          <div
            key={i}
            className="absolute inset-0"
            style={isTop && layers.length > 1 ? { animation: `gt-cover-dissolve ${COVER_DISSOLVE_MS}ms ease-in-out both` } : undefined}
            onAnimationEnd={
              isTop && layers.length > 1
                ? (e) => {
                    if (e.target === e.currentTarget) setShown((s) => ({ ...s, under: null }));
                  }
                : undefined
            }
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={p.url}
              srcSet={srcSet}
              sizes={srcSet ? sizes : undefined}
              alt=""
              fetchPriority={priority && i === 0 ? "high" : undefined}
              className={`absolute inset-0 h-full w-full object-cover ${first && imgClassName ? imgClassName : ""}`}
              style={{ objectPosition: position, ...imgStyle }}
            />
            {framed && (
              <div className="absolute overflow-hidden" style={framed.style}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.url} srcSet={srcSet} sizes={srcSet ? framed.sizes : undefined} alt="" className="h-full w-full object-cover" style={{ objectPosition: position }} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
