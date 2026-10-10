"use client";

export type HeroPhoto = { id: string; url: string; aspect?: number | null };

// The portfolio's top strip (owner, 2026-10-10): every photo at the strip's height and its own
// width, so landscape and portrait photos alike show whole, never cropped. The row drifts slowly
// sideways in a loop (two copies, the animation moves exactly one copy's length), pauses under the
// pointer, and is a plain scrollable row for visitors who turned motion off.
// On "הכל" it shows the photos the photographer starred; inside a tab, a random mix from that tab
// (PortfolioBrowser picks which).
// Low enough on a phone (62vw) that a whole landscape photo fits across the screen.
export const STRIP_HEIGHT = "clamp(200px, min(46vh, 62vw), 520px)";
// Seconds the row takes to travel one landscape-photo width.
const SECONDS_PER_WIDTH = 4;
const MIN_PER_COPY = 8;

export default function PortfolioHeroStrip({ photos }: { photos: HeroPhoto[] }) {
  if (photos.length === 0) return null;
  // A short list is repeated so one copy is wider than the screen, or the loop shows a gap.
  const copy: HeroPhoto[] = [];
  while (copy.length < Math.max(MIN_PER_COPY, photos.length)) copy.push(...photos);
  const duration = Math.max(20, copy.reduce((sum, p) => sum + (p.aspect ?? 1.5), 0) * SECONDS_PER_WIDTH);

  return (
    <div
      className="relative overflow-hidden portfolio-hero-strip select-none"
      dir="ltr"
      style={{ height: STRIP_HEIGHT, WebkitTouchCallout: "none" }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {/* A margin after every photo (not a gap) keeps both copies exactly the same length. */}
      <div className="portfolio-hero-track flex h-full w-max" style={{ animationDuration: `${duration}s` }}>
        {[0, 1].map((half) =>
          copy.map((p, i) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={`${half}-${i}-${p.id}`}
              src={p.url}
              alt=""
              draggable={false}
              aria-hidden={half === 1}
              className="h-full w-auto max-w-none shrink-0 object-contain me-1"
              // The width is known before the photo loads, so the row doesn't jump as photos arrive.
              style={p.aspect ? { aspectRatio: String(p.aspect) } : undefined}
            />
          ))
        )}
      </div>
      <style>{`
        @keyframes portfolio-hero-drift { from { transform: translateX(0); } to { transform: translateX(-50%); } }
        .portfolio-hero-track { animation: portfolio-hero-drift linear infinite; }
        .portfolio-hero-strip:hover .portfolio-hero-track { animation-play-state: paused; }
        @media (prefers-reduced-motion: reduce) {
          .portfolio-hero-strip { overflow-x: auto; }
          .portfolio-hero-track { animation: none; }
        }
      `}</style>
    </div>
  );
}
