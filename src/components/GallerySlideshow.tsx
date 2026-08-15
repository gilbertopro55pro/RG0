"use client";

import { useEffect, useMemo, useState } from "react";

type SlidePhoto = { id: string; url: string };

const EFFECTS = [
  "kenburns-in",
  "kenburns-out",
  "fade-punch",
  "slide-left",
  "slide-right",
  "slide-up",
  "slide-down",
  "rotate-in",
  "circle-reveal",
] as const;
type Effect = (typeof EFFECTS)[number];

const SLIDE_MS = 3000;
const ENTRANCE_MS = 1100;
const ENTRANCE = `${ENTRANCE_MS}ms cubic-bezier(0.22, 1, 0.36, 1) forwards`;

const ANIMATIONS: Record<Effect, string> = {
  "kenburns-in": `gs-kenburns-in ${SLIDE_MS}ms ease-out forwards`,
  "kenburns-out": `gs-kenburns-out ${SLIDE_MS}ms ease-out forwards`,
  "fade-punch": `gs-fade-punch ${ENTRANCE}`,
  "slide-left": `gs-slide-left ${ENTRANCE}`,
  "slide-right": `gs-slide-right ${ENTRANCE}`,
  "slide-up": `gs-slide-up ${ENTRANCE}`,
  "slide-down": `gs-slide-down ${ENTRANCE}`,
  "rotate-in": `gs-rotate-in ${ENTRANCE}`,
  "circle-reveal": `gs-circle-reveal ${ENTRANCE}`,
};

// A different random effect per photo per mount (not per render) — picked once up front so the
// same slide doesn't re-roll its effect every time the interval ticks back around to it.
function randomEffects(count: number): Effect[] {
  return Array.from({ length: count }, () => EFFECTS[Math.floor(Math.random() * EFFECTS.length)]);
}

export default function GallerySlideshow({
  photos,
  onClose,
  onDownload,
  downloading = false,
}: {
  photos: SlidePhoto[];
  onClose: () => void;
  onDownload?: () => void;
  downloading?: boolean;
}) {
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(true);
  const effects = useMemo(() => randomEffects(photos.length), [photos.length]);

  const next = () => setIndex((i) => (i + 1) % photos.length);
  const prev = () => setIndex((i) => (i - 1 + photos.length) % photos.length);

  useEffect(() => {
    if (!playing || photos.length <= 1) return;
    const t = setTimeout(next, SLIDE_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, playing, photos.length]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") prev();
      if (e.key === "ArrowLeft") next();
      if (e.key === " ") {
        e.preventDefault();
        setPlaying((p) => !p);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [photos.length]);

  if (photos.length === 0) return null;
  const photo = photos[index];
  const effect = effects[index];

  return (
    <div className="fixed inset-0 z-[80] bg-black flex items-center justify-center overflow-hidden select-none">
      <style>{`
        @keyframes gs-kenburns-in { from { transform: scale(1); } to { transform: scale(1.32); } }
        @keyframes gs-kenburns-out { from { transform: scale(1.32); } to { transform: scale(1); } }
        @keyframes gs-fade-punch { from { opacity: 0; transform: scale(0.88); } to { opacity: 1; transform: scale(1); } }
        @keyframes gs-slide-left { from { transform: translateX(22%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
        @keyframes gs-slide-right { from { transform: translateX(-22%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
        @keyframes gs-slide-up { from { transform: translateY(18%); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
        @keyframes gs-slide-down { from { transform: translateY(-18%); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
        @keyframes gs-rotate-in { from { opacity: 0; transform: rotate(-9deg) scale(0.9); } to { opacity: 1; transform: rotate(0deg) scale(1); } }
        @keyframes gs-circle-reveal { from { clip-path: circle(0% at 50% 50%); } to { clip-path: circle(75% at 50% 50%); } }
      `}</style>

      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        key={photo.id}
        src={photo.url}
        alt=""
        className="max-w-full max-h-full object-contain"
        style={{ animation: ANIMATIONS[effect] }}
      />

      <div className="absolute top-4 left-4 flex items-center gap-2">
        <button
          onClick={onClose}
          aria-label="סגירת מצגת"
          className="h-10 w-10 rounded-full bg-white/10 text-white flex items-center justify-center text-lg"
        >
          ✕
        </button>
        {onDownload && (
          <button
            onClick={onDownload}
            disabled={downloading}
            aria-label="הורדת כל תמונות המצגת"
            title="הורדת כל תמונות המצגת"
            className="h-10 w-10 rounded-full bg-white/10 text-white flex items-center justify-center disabled:opacity-50"
          >
            <svg width={17} height={17} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 3v12m0 0l-4-4m4 4l4-4" />
              <path d="M5 17v2a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-2" />
            </svg>
          </button>
        )}
      </div>

      <button
        onClick={() => setPlaying((p) => !p)}
        aria-label={playing ? "השהיה" : "המשך"}
        className="absolute top-4 right-4 h-10 w-10 rounded-full bg-white/10 text-white flex items-center justify-center text-sm font-semibold"
      >
        {playing ? "⏸" : "▶"}
      </button>

      {photos.length > 1 && (
        <>
          <button
            onClick={prev}
            aria-label="התמונה הבאה"
            className="absolute right-3 h-11 w-11 rounded-full bg-white/10 text-white flex items-center justify-center text-xl"
          >
            ›
          </button>
          <button
            onClick={next}
            aria-label="התמונה הקודמת"
            className="absolute left-3 h-11 w-11 rounded-full bg-white/10 text-white flex items-center justify-center text-xl"
          >
            ‹
          </button>
        </>
      )}

      <span dir="ltr" className="absolute bottom-5 left-1/2 -translate-x-1/2 text-xs font-semibold text-white/70 font-data tracking-wide">
        {index + 1} / {photos.length}
      </span>
    </div>
  );
}
