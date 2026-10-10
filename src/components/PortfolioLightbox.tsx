"use client";

import { useEffect, useRef } from "react";

type LightboxPhoto = { id: string; url: string };

// Full-screen view of one portfolio photo (owner, 2026-10-10: "רק הצגה", no saving or sharing).
// A web page can't stop a screenshot or a screen recording — no website can — so this only takes
// away the easy ways to keep the file: there's no download or share button, the photo sits under
// a transparent layer (a long press or right click lands on the layer, so the browser offers no
// "save image"), it can't be dragged out, and iOS's long-press callout is off.
export default function PortfolioLightbox({
  photos,
  index,
  onIndex,
  onClose,
  onNearEnd,
}: {
  photos: LightboxPhoto[];
  index: number;
  onIndex: (index: number) => void;
  onClose: () => void;
  // Fired when the viewer reaches the last few loaded photos, so the grid loads the next page.
  onNearEnd: () => void;
}) {
  const photo = photos[index];
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const hasPrev = index > 0;
  const hasNext = index < photos.length - 1;
  const go = (delta: number) => {
    const next = index + delta;
    if (next >= 0 && next < photos.length) onIndex(next);
  };

  useEffect(() => {
    if (index >= photos.length - 3) onNearEnd();
    // The neighbours load while this one is on screen, so moving on is instant.
    for (const n of [photos[index + 1], photos[index - 1]]) if (n) new Image().src = n.url;
  }, [index, photos, onNearEnd]);

  // The page is right to left: the next photo is on the left (ArrowLeft, or a swipe to the right).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowLeft") go(1);
      else if (e.key === "ArrowRight") go(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  if (!photo) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center select-none"
      style={{ background: "#000", WebkitTouchCallout: "none" }}
      onContextMenu={(e) => e.preventDefault()}
      role="dialog"
      aria-modal="true"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        key={photo.id}
        src={photo.url}
        alt=""
        draggable={false}
        className="max-h-full max-w-full object-contain"
        style={{ pointerEvents: "none", WebkitUserSelect: "none", userSelect: "none" }}
      />
      {/* The layer that takes every touch and click instead of the photo (see the comment above). */}
      <div
        className="absolute inset-0"
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
        onTouchStart={(e) => {
          const t = e.touches[0];
          touchStart.current = { x: t.clientX, y: t.clientY };
        }}
        onTouchEnd={(e) => {
          const start = touchStart.current;
          touchStart.current = null;
          if (!start) return;
          const t = e.changedTouches[0];
          const dx = t.clientX - start.x;
          const dy = t.clientY - start.y;
          if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) go(dx > 0 ? 1 : -1);
          else if (dy > 90 && Math.abs(dy) > Math.abs(dx)) onClose();
        }}
      />

      <button
        onClick={onClose}
        aria-label="סגירה"
        className="absolute top-3 start-3 h-11 w-11 rounded-full flex items-center justify-center"
        style={{ background: "rgba(255,255,255,0.12)", color: "#f2f2ee", marginTop: "env(safe-area-inset-top, 0px)" }}
      >
        <svg viewBox="0 0 24 24" width={20} height={20} fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" aria-hidden="true">
          <path d="M6 6l12 12M18 6L6 18" />
        </svg>
      </button>
      {/* dir on the inner span only: on the positioned one it would flip which side "end" is. */}
      <span className="absolute top-5 end-5 text-xs font-semibold tabular-nums" style={{ color: "#b7b7bd", marginTop: "env(safe-area-inset-top, 0px)" }}>
        <span dir="ltr">
          {index + 1} / {photos.length}
        </span>
      </span>
      {hasPrev && (
        <button
          onClick={() => go(-1)}
          aria-label="התמונה הקודמת"
          className="hidden sm:flex absolute top-1/2 -translate-y-1/2 start-4 h-12 w-12 rounded-full items-center justify-center"
          style={{ background: "rgba(255,255,255,0.12)", color: "#f2f2ee" }}
        >
          <svg viewBox="0 0 24 24" width={22} height={22} fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M9 6l6 6-6 6" />
          </svg>
        </button>
      )}
      {hasNext && (
        <button
          onClick={() => go(1)}
          aria-label="התמונה הבאה"
          className="hidden sm:flex absolute top-1/2 -translate-y-1/2 end-4 h-12 w-12 rounded-full items-center justify-center"
          style={{ background: "rgba(255,255,255,0.12)", color: "#f2f2ee" }}
        >
          <svg viewBox="0 0 24 24" width={22} height={22} fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M15 6l-6 6 6 6" />
          </svg>
        </button>
      )}
    </div>
  );
}
