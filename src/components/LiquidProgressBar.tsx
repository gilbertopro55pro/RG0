"use client";

import type { CSSProperties } from "react";

// The same green "liquid water filling" progress visual as the app's boot splash
// (src/app/layout.tsx's #boot-progress) — extracted here so upload/export flows can reuse the
// exact effect instead of a plain flat bar. Renders full-bleed inside whatever container sizes
// it (set width/height on the wrapper via className/style), so it works both as a standalone
// pill and as a background layer behind button text.
export default function LiquidProgressBar({
  pct,
  className = "",
  style,
}: {
  pct: number;
  className?: string;
  style?: CSSProperties;
}) {
  const clamped = Math.max(0, Math.min(100, pct));
  return (
    <div className={`liquid-progress-track ${className}`} style={style}>
      <div className="liquid-progress-fill" style={{ width: `${clamped}%` }} />
      <style>{`
        .liquid-progress-track {
          position: relative;
          width: 100%;
          height: 100%;
          border-radius: 999px;
          overflow: hidden;
          background: rgba(28, 27, 25, 0.12);
          box-shadow: inset 0 1px 3px rgba(28, 27, 25, 0.18);
        }
        .liquid-progress-fill {
          position: relative;
          height: 100%;
          border-radius: inherit;
          background: linear-gradient(180deg, #4ecb7d, #2fae5c);
          transition: width 0.3s ease-out;
          overflow: hidden;
        }
        .liquid-progress-fill::after {
          content: "";
          position: absolute;
          top: 0;
          left: -34px;
          right: -34px;
          bottom: 0;
          background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='34' height='12' viewBox='0 0 34 12'%3E%3Cpath d='M0 6 Q 8.5 0 17 6 T 34 6 V12 H0 Z' fill='rgba(255,255,255,0.35)'/%3E%3C/svg%3E");
          background-repeat: repeat-x;
          background-size: 34px 12px;
          animation: liquidWaveScroll 0.9s linear infinite;
        }
        @keyframes liquidWaveScroll { from { background-position-x: 0; } to { background-position-x: 34px; } }
      `}</style>
    </div>
  );
}
