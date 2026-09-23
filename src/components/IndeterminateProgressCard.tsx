"use client";

// A lighter sibling of ProgressModal.tsx for a quick action with no real progress to report (a
// single fetch, not a multi-step operation) — same dark card + glow-behind-spinner visual language
// as the upload/export screens, but an indeterminate spin instead of a percentage ring, and no
// cancel/background escape hatch (there's nothing meaningful to cancel mid-flight).
export function IndeterminateProgressCard({ label }: { label: string }) {
  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4" style={{ background: "rgba(28, 27, 25, 0.55)" }}>
      <div className="relative w-64 rounded-3xl overflow-hidden shadow-sheet" style={{ background: "#1c1b19" }}>
        <div className="relative flex flex-col items-center gap-4 px-6 py-9 text-white text-center">
          <div className="relative" style={{ width: 112, height: 112 }}>
            <div
              aria-hidden="true"
              className="absolute inset-0 rounded-full"
              style={{
                background: "conic-gradient(from 180deg, var(--color-coral), var(--color-amber), var(--color-lime), var(--color-coral))",
                filter: "blur(20px)",
                opacity: 0.55,
              }}
            />
            <svg viewBox="0 0 100 100" width={112} height={112} className="relative animate-spin" style={{ animationDuration: "1.1s" }}>
              <circle cx={50} cy={50} r={radius} fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth={8} />
              <circle
                cx={50}
                cy={50}
                r={radius}
                fill="none"
                stroke="#fff"
                strokeWidth={8}
                strokeLinecap="round"
                strokeDasharray={`${circumference * 0.28} ${circumference}`}
              />
            </svg>
          </div>
          <div className="text-sm font-semibold">{label}</div>
        </div>
      </div>
    </div>
  );
}
