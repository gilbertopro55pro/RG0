"use client";

import { useEffect, useState } from "react";
import BodyPortal from "@/components/BodyPortal";

const BRASS = "#c9a24b";
const TEXT_SOFT = "#b7b7bd";

export type PortfolioVideoItem = { id: string; url: string; name: string };

// The brass play triangle, also on a tab tile that only has videos (PortfolioBrowser).
export function PlayIcon({ size = 22 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
      <path d="M8 5.5v13l10.5-6.5z" fill={BRASS} />
    </svg>
  );
}

// The videos of the open tab (or sub-tab, or all of them on "הכל"), above the photo grid. Each tile
// shows the clip's first frame; tapping one plays it full screen. Same "view only" stance as the
// photos (PortfolioLightbox): no download button in the player and no right-click menu.
export default function PortfolioVideoSection({ videos }: { videos: PortfolioVideoItem[] }) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  if (videos.length === 0) return null;
  const single = videos.length === 1;

  return (
    <div className="max-w-5xl mx-auto mb-12">
      <p className="text-center text-xs font-semibold mb-6" style={{ color: TEXT_SOFT }}>
        סרטונים
      </p>
      {/* Wrapped and centred, so a short last row sits in the middle; a single video gets a wide tile. */}
      <div className="flex flex-wrap justify-center gap-3 select-none" style={{ WebkitTouchCallout: "none" }} onContextMenu={(e) => e.preventDefault()}>
        {videos.map((v, i) => (
          <button
            key={v.id}
            type="button"
            onClick={() => setOpenIndex(i)}
            className={`group flex flex-col gap-1.5 text-start ${single ? "w-full max-w-3xl" : "w-[calc(50%_-_0.375rem)] md:w-[calc(33.333%_-_0.5rem)]"}`}
          >
            <span className="relative block w-full aspect-video rounded-lg overflow-hidden" style={{ background: "#151517" }}>
              {/* #t=0.1 makes the browser (iOS Safari too) paint that frame as the poster. */}
              <video
                src={`${v.url}#t=0.1`}
                preload="metadata"
                muted
                playsInline
                tabIndex={-1}
                className="absolute inset-0 h-full w-full object-cover pointer-events-none"
              />
              <span className="absolute inset-0 flex items-center justify-center">
                <span
                  className="h-12 w-12 rounded-full flex items-center justify-center transition-transform group-hover:scale-110"
                  style={{ background: "rgba(11,11,13,0.6)", boxShadow: `0 0 0 1.5px ${BRASS}` }}
                >
                  <PlayIcon />
                </span>
              </span>
            </span>
            <span className="text-[11px] leading-snug truncate w-full" style={{ color: TEXT_SOFT }}>
              {v.name}
            </span>
          </button>
        ))}
      </div>
      {openIndex !== null && videos[openIndex] && (
        <BodyPortal>
          <VideoPlayer videos={videos} index={openIndex} onIndex={setOpenIndex} onClose={() => setOpenIndex(null)} />
        </BodyPortal>
      )}
    </div>
  );
}

function VideoPlayer({
  videos,
  index,
  onIndex,
  onClose,
}: {
  videos: PortfolioVideoItem[];
  index: number;
  onIndex: (index: number) => void;
  onClose: () => void;
}) {
  const video = videos[index];
  const hasPrev = index > 0;
  const hasNext = index < videos.length - 1;
  const go = (delta: number) => {
    const next = index + delta;
    if (next >= 0 && next < videos.length) onIndex(next);
  };

  // Right to left, like the photo viewer: the next video is on the left (ArrowLeft). The arrows are
  // taken from the player's own seek shortcut, or one press would seek and switch at once.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        e.preventDefault();
        go(e.key === "ArrowLeft" ? 1 : -1);
      }
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

  const roundButton = { background: "rgba(255,255,255,0.12)", color: "#f2f2ee" };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center select-none"
      style={{ background: "#000", WebkitTouchCallout: "none" }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      onContextMenu={(e) => e.preventDefault()}
      role="dialog"
      aria-modal="true"
      aria-label={video.name}
    >
      {/* key: a new element per video, so autoPlay starts each one from the beginning. */}
      <video
        key={video.id}
        src={video.url}
        controls
        autoPlay
        playsInline
        controlsList="nodownload"
        // Shorter on a phone when there are arrows, which sit below it there.
        className={`max-w-[90vw] bg-black ${videos.length > 1 ? "max-h-[75vh] sm:max-h-[85vh]" : "max-h-[85vh]"}`}
        onContextMenu={(e) => e.preventDefault()}
      />

      <button
        onClick={onClose}
        aria-label="סגירה"
        className="absolute top-3 start-3 h-11 w-11 rounded-full flex items-center justify-center"
        style={{ ...roundButton, marginTop: "env(safe-area-inset-top, 0px)" }}
      >
        <svg viewBox="0 0 24 24" width={20} height={20} fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" aria-hidden="true">
          <path d="M6 6l12 12M18 6L6 18" />
        </svg>
      </button>
      {videos.length > 1 && (
        // dir on the inner span only: on the positioned one it would flip which side "end" is.
        <span className="absolute top-5 end-5 text-xs font-semibold tabular-nums" style={{ color: TEXT_SOFT, marginTop: "env(safe-area-inset-top, 0px)" }}>
          <span dir="ltr">
            {index + 1} / {videos.length}
          </span>
        </span>
      )}
      {/* On a phone the arrows sit side by side below the video, clear of its controls; wider, at
          the sides. The row is display:contents from sm up, so the buttons place against the overlay;
          a tap between the buttons falls through to the backdrop and closes, like anywhere else. */}
      {videos.length > 1 && (
        <div className="absolute inset-x-0 bottom-5 flex justify-center gap-4 pointer-events-none sm:contents" style={{ marginBottom: "env(safe-area-inset-bottom, 0px)" }}>
          {hasPrev && (
            <button
              onClick={() => go(-1)}
              aria-label="הסרטון הקודם"
              className="sm:absolute sm:top-1/2 sm:-translate-y-1/2 sm:start-4 h-12 w-12 rounded-full flex items-center justify-center pointer-events-auto"
              style={roundButton}
            >
              <svg viewBox="0 0 24 24" width={22} height={22} fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M9 6l6 6-6 6" />
              </svg>
            </button>
          )}
          {hasNext && (
            <button
              onClick={() => go(1)}
              aria-label="הסרטון הבא"
              className="sm:absolute sm:top-1/2 sm:-translate-y-1/2 sm:end-4 h-12 w-12 rounded-full flex items-center justify-center pointer-events-auto"
              style={roundButton}
            >
              <svg viewBox="0 0 24 24" width={22} height={22} fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M15 6l-6 6 6 6" />
              </svg>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
