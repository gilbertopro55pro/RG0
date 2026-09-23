"use client";

import { useEffect, useRef, useState } from "react";

type HeroPhoto = { id: string; url: string };

const SLIDE_COUNT = 5; // how many random triplets to cycle through before reshuffling
const SLIDE_MS = 5000; // how long each triplet stays on screen
const TRANSITION_MS = 900; // must match the CSS transition-duration below

function shuffled<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

// The portfolio's "hero": a strip of 3 large photos that auto-advances to a new, randomly-picked
// triplet every few seconds — a moving showcase rather than one static banner. Built as an
// "infinite" carousel (a cloned first slide appended after the real ones) so advancing past the
// last slide never has to jump backwards through the whole deck: it slides forward into the
// clone, then — once that transition finishes — snaps instantly (transition disabled for one
// frame) back to a freshly-reshuffled slide 0, so the reshuffle is invisible to the viewer.
export default function PortfolioHeroCarousel({ photos }: { photos: HeroPhoto[] }) {
  const [slides, setSlides] = useState<HeroPhoto[][]>(() => chunk(shuffled(photos), 3).slice(0, SLIDE_COUNT));
  const [index, setIndex] = useState(0);
  const [instant, setInstant] = useState(false);
  const resetTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (slides.length <= 1) return;
    const advance = setInterval(() => setIndex((i) => i + 1), SLIDE_MS);
    return () => clearInterval(advance);
  }, [slides.length]);

  // Fires only when we've just slid onto the appended clone-of-slide-0 — reshuffle, then jump back
  // to the real index 0 with the transition switched off for one paint so the jump is invisible.
  useEffect(() => {
    if (index !== slides.length) return;
    resetTimeout.current = setTimeout(() => {
      setInstant(true);
      setSlides(chunk(shuffled(photos), 3).slice(0, SLIDE_COUNT));
      setIndex(0);
      requestAnimationFrame(() => requestAnimationFrame(() => setInstant(false)));
    }, TRANSITION_MS);
    return () => {
      if (resetTimeout.current) clearTimeout(resetTimeout.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, slides.length]);

  if (photos.length === 0) return null;

  // Fewer than 3 photos total: nothing to cycle through, just show what exists once, statically.
  if (slides.length <= 1) {
    const only = slides[0] ?? [];
    return (
      <div className="grid grid-cols-1 md:grid-cols-3 gap-1 h-[46vh] min-h-[280px] max-h-[560px]">
        {only.map((p) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img key={p.id} src={p.url} alt="" className="w-full h-full object-cover" />
        ))}
      </div>
    );
  }

  const renderSlides = [...slides, slides[0]];

  return (
    <div className="relative h-[46vh] min-h-[280px] max-h-[560px] overflow-hidden" dir="ltr">
      <div
        className="flex h-full"
        style={{
          width: `${renderSlides.length * 100}%`,
          transform: `translateX(-${(index / renderSlides.length) * 100}%)`,
          transition: instant ? "none" : `transform ${TRANSITION_MS}ms cubic-bezier(0.16, 1, 0.3, 1)`,
        }}
      >
        {renderSlides.map((triplet, i) => (
          <div key={i} className="grid grid-cols-1 md:grid-cols-3 gap-1 h-full shrink-0" style={{ width: `${100 / renderSlides.length}%` }}>
            {triplet.map((p, j) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={p.id}
                src={p.url}
                alt=""
                className={j === 0 ? "w-full h-full object-cover" : "w-full h-full object-cover hidden md:block"}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
