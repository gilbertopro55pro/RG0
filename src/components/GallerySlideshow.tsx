"use client";

import { useEffect, useMemo, useState } from "react";

type SlidePhoto = { id: string; url: string };

const EFFECTS = ["kenburns-in", "kenburns-out", "fade", "slide-left", "slide-right"] as const;
type Effect = (typeof EFFECTS)[number];

const SLIDE_MS = 5000;

const ANIMATIONS: Record<Effect, string> = {
  "kenburns-in": `gs-kenburns-in ${SLIDE_MS}ms ease-out forwards`,
  "kenburns-out": `gs-kenburns-out ${SLIDE_MS}ms ease-out forwards`,
  fade: "gs-fade 900ms ease-out forwards",
  "slide-left": "gs-slide-left 900ms ease-out forwards",
  "slide-right": "gs-slide-right 900ms ease-out forwards",
};

// A different random effect per photo per mount (not per render) — picked once up front so the
// same slide doesn't re-roll its effect every time the interval ticks back around to it.
function randomEffects(count: number): Effect[] {
  return Array.from({ length: count }, () => EFFECTS[Math.floor(Math.random() * EFFECTS.length)]);
}

export default function GallerySlideshow({ photos, onClose }: { photos: SlidePhoto[]; onClose: () => void }) {
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
        @keyframes gs-kenburns-in { from { transform: scale(1); } to { transform: scale(1.16); } }
        @keyframes gs-kenburns-out { from { transform: scale(1.16); } to { transform: scale(1); } }
        @keyframes gs-fade { from { opacity: 0; } to { opacity: 1; } }
        @keyframes gs-slide-left { from { transform: translateX(5%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
        @keyframes gs-slide-right { from { transform: translateX(-5%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
      `}</style>

      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        key={photo.id}
        src={photo.url}
        alt=""
        className="max-w-full max-h-full object-contain"
        style={{ animation: ANIMATIONS[effect] }}
      />

      <button
        onClick={onClose}
        aria-label="סגירת מצגת"
        className="absolute top-4 left-4 h-10 w-10 rounded-full bg-white/10 text-white flex items-center justify-center text-lg"
      >
        ✕
      </button>

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
