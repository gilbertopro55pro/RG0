"use client";

import { useRef, useState } from "react";
import { useT } from "@/i18n/client";
import { MIN_SEGMENT } from "@/lib/reels/render";

// The reel's timeline (owner, 2026-10-07: "very simple, drag & drop"): one clip per photo, as
// wide as the time it's on screen, scrolling sideways. Drag the gold line between two clips to
// give one more time and the other less (with a fixed length the total stays exactly the same;
// with no fixed length only that clip changes and the reel grows or shrinks); drag a clip by its
// handle to move it; tap a clip to jump the preview there. A dragged edge snaps (magnet) to the
// music's beat, whole and half seconds, the playhead, or an even split, with a guide line saying
// which — the photographer can turn snapping off.

export type TimelineClip = { key: string; thumbs: string[]; video?: boolean };

// How close (in pixels) an edge has to come to a snap point to jump onto it.
const SNAP_PX = 10;

export default function ReelTimelineEditor({
  clips,
  durs,
  starts,
  total,
  tail,
  time,
  beat,
  onSeek,
  onDurs,
  onReorder,
  free,
  snap,
  onSnap,
}: {
  clips: TimelineClip[];
  durs: number[];
  starts: number[];
  total: number;
  tail: number;
  time: number;
  // Seconds per beat of the music, when known: a dragged edge snaps to it.
  beat: number | null;
  onSeek: (t: number) => void;
  onDurs: (durs: number[]) => void;
  onReorder: (from: number, to: number) => void;
  // No fixed length: an edge only changes the clip before it.
  free: boolean;
  snap: boolean;
  onSnap: (on: boolean) => void;
}) {
  const t = useT();
  // A fixed scale with no fixed length, so the clips don't rescale under the finger while it drags.
  const pps = free ? 60 : Math.max(40, Math.min(140, 900 / total));
  const width = total * pps;
  const scroller = useRef<HTMLDivElement | null>(null);
  const [drag, setDrag] = useState<{ from: number; dx: number; to: number } | null>(null);
  const [guide, setGuide] = useState<{ at: number; label: string } | null>(null);

  // The snap points for the edge after clip k, nearest first; null when nothing is close.
  const snapTo = (raw: number, k: number, pairEnd: number): { at: number; label: string } | null => {
    const points: { at: number; label: string }[] = [];
    if (beat) points.push({ at: Math.round(raw / beat) * beat, label: t("קצב") });
    points.push({ at: Math.round(raw), label: t("שנייה שלמה") });
    points.push({ at: Math.round(raw * 2) / 2, label: t("חצי שנייה") });
    points.push({ at: time, label: t("הסמן") });
    if (!free && k + 1 < durs.length) points.push({ at: (starts[k] + pairEnd) / 2, label: t("חלוקה שווה") });
    if (free && k > 0) points.push({ at: starts[k] + durs[k - 1], label: t("כמו התמונה הקודמת") });
    const thr = SNAP_PX / pps;
    let best: { at: number; label: string } | null = null;
    for (const pt of points) if (Math.abs(pt.at - raw) <= thr && (!best || Math.abs(pt.at - raw) < Math.abs(best.at - raw))) best = pt;
    return best;
  };

  // Dragging the edge after clip k.
  const startResize = (k: number) => (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const el = e.currentTarget as HTMLElement;
    el.setPointerCapture(e.pointerId);
    const x0 = e.clientX;
    const a0 = durs[k];
    const b0 = durs[k + 1] ?? 0;
    const edge0 = starts[k] + a0;
    const pairEnd = starts[k] + a0 + b0;
    const lo = starts[k] + MIN_SEGMENT;
    const hi = free ? starts[k] + 60 : pairEnd - MIN_SEGMENT;
    const move = (ev: PointerEvent) => {
      const raw = edge0 + (ev.clientX - x0) / pps;
      const hit = snap ? snapTo(raw, k, pairEnd) : null;
      const edge = Math.max(lo, Math.min(hi, hit ? hit.at : Math.round(raw * 100) / 100));
      setGuide(hit && edge === hit.at ? hit : null);
      const next = durs.slice();
      next[k] = edge - starts[k];
      if (!free) next[k + 1] = a0 + b0 - next[k];
      onDurs(next);
    };
    const up = () => {
      setGuide(null);
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", up);
    };
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
  };

  // Dragging clip k by its handle to a new place.
  const startMove = (k: number) => (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const el = e.currentTarget as HTMLElement;
    el.setPointerCapture(e.pointerId);
    const x0 = e.clientX;
    const centre = starts[k] + durs[k] / 2;
    const targetOf = (dx: number) => {
      const at = centre + dx / pps;
      let to = 0;
      for (let i = 0; i < clips.length; i++) if (at > starts[i] + durs[i] / 2) to = i;
      if (at < starts[0] + durs[0] / 2) to = 0;
      return to;
    };
    setDrag({ from: k, dx: 0, to: k });
    const move = (ev: PointerEvent) => {
      const dx = ev.clientX - x0;
      setDrag({ from: k, dx, to: targetOf(dx) });
      // Scroll along when the clip is dragged to an edge of the visible part.
      const sc = scroller.current;
      if (sc) {
        const r = sc.getBoundingClientRect();
        if (ev.clientX < r.left + 30) sc.scrollLeft -= 12;
        else if (ev.clientX > r.right - 30) sc.scrollLeft += 12;
      }
    };
    const up = (ev: PointerEvent) => {
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", up);
      const to = targetOf(ev.clientX - x0);
      setDrag(null);
      if (to !== k) onReorder(k, to);
    };
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
  };

  const ticks = [];
  const step = total > 30 ? 5 : total > 10 ? 2 : 1;
  for (let s = 0; s <= total + 1e-6; s += step) ticks.push(s);

  const edges = free ? clips.map((_, k) => k) : clips.slice(0, -1).map((_, k) => k);

  return (
    <div>
    <div className="flex justify-end mb-1.5">
      <button
        type="button"
        onClick={() => onSnap(!snap)}
        aria-pressed={snap}
        className={`flex items-center gap-1.5 h-7 px-2.5 rounded-md border text-[11px] font-semibold transition-colors ${snap ? "bg-ink text-white border-ink" : "bg-white text-ink-soft border-line"}`}
        title={t("נעיצה של הקצוות לקצב, לשניות ולסמן")}
      >
        <svg viewBox="0 0 24 24" width={13} height={13} fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" aria-hidden="true">
          <path d="M6 3v8a6 6 0 0 0 12 0V3" />
          <path d="M6 7h4M14 7h4" />
        </svg>
        {snap ? t("נעיצה פועלת") : t("נעיצה כבויה")}
      </button>
    </div>
    <div ref={scroller} dir="ltr" className="overflow-x-auto overscroll-x-contain pb-2 select-none" style={{ scrollbarWidth: "thin" }}>
      <div className="relative" style={{ width: width + 24, paddingInline: 12 }}>
        {/* time ruler: tap to jump there */}
        <div
          className="relative h-5 cursor-pointer"
          onClick={(e) => {
            const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
            onSeek(Math.max(0, Math.min(total, (e.clientX - r.left) / pps)));
          }}
        >
          {ticks.map((s) => (
            <span key={s} className="absolute top-0 text-[10px] text-ink-soft font-data -translate-x-1/2" style={{ left: s * pps }}>
              {s}s
            </span>
          ))}
        </div>
        <div className="relative h-[76px]">
          {clips.map((c, k) => {
            const dragging = drag?.from === k;
            const left = starts[k] * pps;
            const w = Math.max(8, durs[k] * pps - 3);
            return (
              <div
                key={c.key}
                className={`absolute top-0 h-full overflow-hidden rounded-sm bg-black transition-shadow ${dragging ? "z-20 shadow-sheet ring-2 ring-amber-deep" : "z-0"}`}
                style={{ left, width: w, transform: dragging ? `translateX(${drag.dx}px) translateY(-4px)` : undefined, transition: dragging ? "none" : "left 120ms, width 60ms" }}
                onClick={() => onSeek(starts[k] + 0.01)}
              >
                <div className="flex h-full">
                  {c.thumbs.map((src, i) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img key={i} src={src} alt="" draggable={false} className="h-full flex-1 min-w-0 object-cover" style={{ opacity: 0.92 }} />
                  ))}
                </div>
                <button
                  type="button"
                  onPointerDown={startMove(k)}
                  onClick={(e) => e.stopPropagation()}
                  className="absolute top-1 left-1 h-6 w-6 rounded-sm bg-black/60 text-white flex items-center justify-center cursor-grab active:cursor-grabbing"
                  style={{ touchAction: "none" }}
                  aria-label={t("גרירה להזזת התמונה")}
                >
                  <svg viewBox="0 0 10 14" width={8} height={12} fill="currentColor" aria-hidden="true">
                    {[2, 7, 12].map((y) => [2, 8].map((x) => <circle key={`${x}${y}`} cx={x} cy={y} r={1.3} />))}
                  </svg>
                </button>
                <span className="absolute bottom-1 left-1 rounded-sm bg-black/60 px-1 text-[10px] text-white font-data">{durs[k].toFixed(1)}s</span>
                {c.video && <span className="absolute top-1 right-1 rounded-sm bg-black/60 px-1 text-[10px] text-white">▶</span>}
              </div>
            );
          })}
          {drag && drag.to !== drag.from && (
            <div
              className="absolute -top-1 -bottom-1 w-[3px] bg-amber-deep z-30"
              style={{ left: (drag.to > drag.from ? starts[drag.to] + durs[drag.to] : starts[drag.to]) * pps - 2 }}
            />
          )}
          {edges.map((k) => (
            <div
              key={`edge-${clips[k].key}`}
              onPointerDown={startResize(k)}
              className="absolute top-0 h-full z-10 flex justify-center cursor-ew-resize group"
              style={{ left: (starts[k] + durs[k]) * pps - 11, width: 20, touchAction: "none" }}
              aria-label={t("גרירה לשינוי הזמן")}
            >
              <span className={`h-full w-[4px] rounded-sm shadow transition-transform ${guide && Math.abs(guide.at - (starts[k] + durs[k])) < 1e-6 ? "bg-amber-deep scale-x-150" : "bg-amber-deep/80 group-hover:bg-amber-deep"}`} />
            </div>
          ))}
          {guide && (
            <div className="absolute -top-5 -bottom-1 z-30 pointer-events-none" style={{ left: guide.at * pps }}>
              <div className="absolute inset-y-0 w-0 border-l border-dashed border-amber-deep" />
              <span className="absolute -top-0.5 left-1 whitespace-nowrap rounded-sm bg-amber-deep px-1 text-[10px] text-white">
                {guide.label} · {guide.at.toFixed(2)}s
              </span>
            </div>
          )}
          {tail > 0 && (
            <div
              className="absolute top-0 h-full rounded-sm border border-dashed border-line bg-white/60 flex items-center justify-center text-[10px] text-ink-soft"
              style={{ left: (total - tail) * pps, width: tail * pps - 3 }}
            >
              {t("סיום")}
            </div>
          )}
          <div className="absolute -top-1 -bottom-1 w-[2px] bg-rose z-40 pointer-events-none" style={{ left: Math.min(total, time) * pps }} />
        </div>
      </div>
    </div>
    </div>
  );
}
