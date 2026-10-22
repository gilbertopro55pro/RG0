"use client";

import { useEffect, useRef, useState } from "react";

// A number that counts up to its value and settles on it (owner, 2026-10-22: the month's revenue
// on the home screen in the vivid look). Same timing as the revenue bar's grow (.gf-grow: 1100ms
// after 150ms, fast then slowing), so the two land together. Counts from 0 when it first shows,
// and from the old value when the page refreshes with a new one. No animation with reduced motion.
// The width is held by the final value, so nothing beside it moves while it counts.
const DURATION_MS = 1100;
const DELAY_MS = 150;
const easeOutExpo = (x: number) => (x >= 1 ? 1 : 1 - Math.pow(2, -10 * x));

export default function CountUp({ value, locale, prefix = "" }: { value: number; locale: string; prefix?: string }) {
  const format = (n: number) => `${prefix}${n.toLocaleString(locale)}`;
  const [shown, setShown] = useState(0);
  const from = useRef(0);

  useEffect(() => {
    const reduced = typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const start = from.current;
    let frame = 0;
    const began = performance.now() + (reduced ? 0 : DELAY_MS);
    const tick = (now: number) => {
      const p = reduced ? 1 : Math.max(0, Math.min(1, (now - began) / DURATION_MS));
      const next = p >= 1 ? value : Math.round(start + (value - start) * easeOutExpo(p));
      from.current = next;
      setShown(next);
      if (p < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value]);

  return (
    <span className="inline-grid tabular-nums">
      <span className="sr-only">{format(value)}</span>
      <span aria-hidden className="invisible [grid-area:1/1]">
        {format(value)}
      </span>
      <span aria-hidden className="[grid-area:1/1] text-start">
        {format(shown)}
      </span>
    </span>
  );
}
