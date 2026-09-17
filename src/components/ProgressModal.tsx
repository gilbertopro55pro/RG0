"use client";

import { useEffect, useState } from "react";

// Full-screen blocking overlay shown during any single heavy operation (upload / face detection /
// album export, including the home-screen quick-export shortcut) — deliberately has no dismiss
// affordance (no backdrop-click-to-close, no X button): it closes itself the moment the underlying
// operation's own state clears to null, and blocking the rest of the page while it's up is the
// point (keeps a photographer from kicking off a second heavy operation on top of one already
// running). Shared between GalleryManageView.tsx (its original home) and
// AlbumQuickAccessButton.tsx's quick-export flow, so both get the exact same spinner/progress
// treatment rather than a lesser duplicate.
export function ProgressModal({
  label,
  pct,
  onCancel,
  onBackground,
}: {
  label: string;
  pct: number;
  onCancel: () => void;
  // When provided, offers a way out that doesn't abort the operation — it keeps running, and the
  // caller is expected to surface its own completion (e.g. a toast) once it settles. Omitted
  // callers keep the modal's original always-blocking behavior unchanged.
  onBackground?: () => void;
}) {
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const target = Math.max(0, Math.min(100, pct));
  // Trickles toward (and a little past) the real value on its own timer, instead of only jumping
  // exactly when a new real value arrives — real progress here only advances in coarse steps (once
  // per rendered page), which reads as visibly frozen for several seconds between updates. This
  // creeps up on its own in that gap too, capped a few points ahead of the last real value (never
  // reaching 100% before the real work is actually done) — per explicit request, to keep the
  // reading feeling alive rather than stalled. A real drop in the target (the PDF export's own
  // multi-pass retry genuinely restarts progress from 0 for its next quality step) snaps down
  // immediately instead of creeping, since that's real state, not something to smooth over.
  const [displayedPct, setDisplayedPct] = useState(target);
  // requestAnimationFrame, not setInterval(200ms) — the old 5-updates-a-second timer, PLUS a CSS
  // `transition` still applied on both the ring's stroke-dashoffset and the tank's height, meant
  // every JS tick re-triggered a fresh 300ms CSS ease on top of an already-interpolated value — two
  // independent smoothing layers fighting each other, which is what actually read as "jumpy" rather
  // than fluid. Per explicit complaint: "הספינר... רץ בקפיצות ולא רץ בצורה חלקה" (the spinner runs
  // in jumps, not smoothly). Now a single JS-driven interpolation at full frame rate is the only
  // thing moving the value, and the CSS transitions were removed to match. Rates below are
  // time-based (scaled by dt, not a fixed per-tick step) so the overall pacing feels the same as
  // before at any frame rate, just far smoother.
  useEffect(() => {
    const CREEP_CEILING_AHEAD = 4;
    let rafId: number;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      setDisplayedPct((prev) => {
        if (target < prev - 5) return target;
        const ceiling = target >= 100 ? 100 : Math.min(99.5, target + CREEP_CEILING_AHEAD);
        if (prev < target) {
          const catchUp = (target - prev) * (1 - Math.exp(-dt / 0.9));
          return Math.min(target, prev + Math.max(0.75 * dt, catchUp));
        }
        if (prev < ceiling) return Math.min(ceiling, prev + 0.25 * dt);
        return prev;
      });
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [target]);
  // Kept fractional (not rounded) — the source progress values below are unrounded too, per
  // explicit request, so the readout actually shows real precision (e.g. "42.37%") climbing toward
  // 100.00% instead of visibly jumping between whole integers.
  const clamped = displayedPct;
  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - clamped / 100);
  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4" style={{ background: "rgba(20,24,20,0.55)" }}>
        {/* Deliberately a fixed dark navy, not `var(--color-ink)` — that token is a TEXT color that
            flips to near-white in dark mode (by design, for use as text-on-dark-background), which
            would turn this white-text-on-dark-card modal illegible the moment the site is in dark
            mode. This card is always dark regardless of site theme, so it needs a color that's
            always dark too. */}
      <div className="relative w-64 rounded-3xl overflow-hidden shadow-sheet" style={{ background: "#201f33" }}>
        {/* Rises from the bottom like a tank filling with water — a second, independent read of
            progress alongside the ring, at the scale of the whole window rather than a thin bar. */}
        <div className="absolute inset-x-0 bottom-0" style={{ height: `${clamped}%`, background: "#1f4d36" }} />
        {!confirmingCancel && (
          <button
            onClick={() => setConfirmingCancel(true)}
            aria-label="ביטול הפעולה"
            className="absolute top-3 left-3 z-10 h-7 w-7 rounded-full flex items-center justify-center bg-rose text-white"
          >
            <svg viewBox="0 0 24 24" width={13} height={13} fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        )}
        {confirmingCancel ? (
          <div className="relative flex flex-col items-center gap-4 px-6 py-9 text-white text-center">
            <div className="text-sm font-semibold">לבטל את הפעולה?</div>
            <div className="text-xs opacity-70">{label} עדיין באמצע — הביטול לא ניתן לשחזור.</div>
            <div className="flex gap-2 w-full mt-2">
              <button onClick={() => setConfirmingCancel(false)} className="flex-1 rounded-lg py-2.5 text-sm font-semibold bg-white/10">
                המשך
              </button>
              <button onClick={onCancel} className="flex-1 rounded-lg py-2.5 text-sm font-semibold bg-rose text-white">
                ביטול הפעולה
              </button>
            </div>
          </div>
        ) : (
          <div className="relative flex flex-col items-center gap-4 px-6 py-9 text-white text-center">
            <div className="relative" style={{ width: 112, height: 112 }}>
              {/* Soft ambient glow behind the ring — purely decorative (aria-hidden), blurred well
                  past the ring's own edge so it reads as a halo rather than a second shape. Static,
                  not animated — the ring's own progress motion is already the thing to watch;
                  adding a second, independently-pulsing element made the screen feel busier rather
                  than calmer, which defeats the point of a subtle glow. */}
              <div
                aria-hidden="true"
                className="absolute inset-0 rounded-full"
                style={{
                  background: "conic-gradient(from 180deg, var(--color-coral), var(--color-amber), var(--color-lime), var(--color-coral))",
                  filter: "blur(20px)",
                  opacity: 0.55,
                }}
              />
              <svg viewBox="0 0 100 100" width={112} height={112} style={{ position: "relative", transform: "rotate(-90deg)" }}>
                <circle cx={50} cy={50} r={radius} fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth={8} />
                <circle
                  cx={50}
                  cy={50}
                  r={radius}
                  fill="none"
                  stroke="#fff"
                  strokeWidth={8}
                  strokeLinecap="round"
                  strokeDasharray={circumference}
                  strokeDashoffset={dashOffset}
                />
                <text x={50} y={51} textAnchor="middle" dominantBaseline="central" fontSize={17} fontWeight={700} fill="#fff" style={{ transform: "rotate(90deg)", transformOrigin: "50px 50px" }} className="font-data">
                  {clamped.toFixed(2)}%
                </text>
              </svg>
            </div>
            <div>
              <div className="text-sm font-semibold">המערכת מבצעת {label}</div>
              <div className="text-xs opacity-70 mt-1">החלון ייסגר אוטומטית בסיום הפעולה</div>
            </div>
            {onBackground && (
              <button onClick={onBackground} className="text-xs font-semibold underline underline-offset-2 opacity-80">
                המשך ברקע
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
