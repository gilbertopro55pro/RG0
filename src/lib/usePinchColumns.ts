"use client";

import { useEffect, useRef, useState } from "react";

function touchDistance(touches: TouchList): number {
  const a = touches[0];
  const b = touches[1];
  return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
}

// Continuous cell-size (px) driver for photo grids — powers both the pinch gesture and the
// on-screen slider off the same number, so dragging either one is perfectly smooth across the
// whole range instead of jumping between a handful of fixed column counts.
//
// Pinching outward (fingers spreading, distance growing) shrinks the photos (smaller cells).
// Pinching inward (fingers closing) grows the photos (larger cells).
//
// `onPinchStart` fires the instant a second touch lands, so callers can cancel any single-touch
// gesture state (long-press timers, pending taps) before it fires mid-pinch.
export function usePinchSize(initialSize: number, min: number, max: number, onPinchStart?: () => void) {
  const [size, setSize] = useState(initialSize);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const sizeRef = useRef(size);
  const activeTouchesRef = useRef(0);
  const onPinchStartRef = useRef(onPinchStart);

  useEffect(() => {
    sizeRef.current = size;
  }, [size]);

  useEffect(() => {
    onPinchStartRef.current = onPinchStart;
  }, [onPinchStart]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    let startDist = 0;
    let startSize = sizeRef.current;

    const onTouchStart = (e: TouchEvent) => {
      activeTouchesRef.current = e.touches.length;
      if (e.touches.length === 2) {
        startDist = touchDistance(e.touches);
        startSize = sizeRef.current;
        onPinchStartRef.current?.();
      }
    };
    const onTouchMove = (e: TouchEvent) => {
      activeTouchesRef.current = e.touches.length;
      if (e.touches.length === 2 && startDist > 0) {
        e.preventDefault();
        const dist = touchDistance(e.touches);
        const next = Math.max(min, Math.min(max, startSize - (dist - startDist) * 0.9));
        setSize(next);
      }
    };
    const onTouchEnd = (e: TouchEvent) => {
      activeTouchesRef.current = e.touches.length;
      if (e.touches.length < 2) startDist = 0;
    };

    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    el.addEventListener("touchend", onTouchEnd, { passive: true });
    el.addEventListener("touchcancel", onTouchEnd, { passive: true });

    return () => {
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
      el.removeEventListener("touchcancel", onTouchEnd);
    };
  }, [min, max]);

  return { size, setSize, containerRef, activeTouchesRef };
}
