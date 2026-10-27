"use client";

import { useEffect, useRef } from "react";

// A one-off burst of confetti over the whole screen (the client gallery, when the favorites reach
// the photo count for the album; owner, 2026-10-27). A canvas on top of everything that lets every
// tap through, about three seconds, then gone. Nothing on a device set to reduce motion.
const COLORS = ["#e8b84a", "#2f9e5b", "#e5322d", "#3b82f6", "#f472b6", "#ffffff"];
const DURATION_MS = 3200;

export default function ConfettiBurst({ onDone }: { onDone: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const done = useRef(onDone);
  useEffect(() => {
    done.current = onDone;
  }, [onDone]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      done.current();
      return;
    }
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = window.innerWidth;
    const h = window.innerHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.scale(dpr, dpr);
    const count = w < 640 ? 110 : 180;
    // Two fountains from the bottom corners, aimed up and inward, falling back down.
    const pieces = Array.from({ length: count }, (_, i) => {
      const left = i % 2 === 0;
      const angle = (left ? -60 : -120) * (Math.PI / 180) + (Math.random() - 0.5) * 0.7;
      const speed = h * (0.016 + Math.random() * 0.014);
      return {
        x: left ? w * 0.05 : w * 0.95,
        y: h + 10,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        size: 5 + Math.random() * 6,
        rot: Math.random() * Math.PI,
        spin: (Math.random() - 0.5) * 0.3,
        color: COLORS[i % COLORS.length],
        round: Math.random() < 0.3,
        delay: Math.random() * 250,
      };
    });
    const start = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const elapsed = now - start;
      ctx.clearRect(0, 0, w, h);
      const fade = elapsed > DURATION_MS - 600 ? Math.max(0, (DURATION_MS - elapsed) / 600) : 1;
      for (const p of pieces) {
        if (elapsed < p.delay) continue;
        p.vy += h * 0.00045;
        p.vx *= 0.99;
        p.x += p.vx;
        p.y += p.vy;
        p.rot += p.spin;
        ctx.save();
        ctx.globalAlpha = fade;
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        if (p.round) {
          ctx.beginPath();
          ctx.arc(0, 0, p.size / 2, 0, Math.PI * 2);
          ctx.fill();
        } else ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
        ctx.restore();
      }
      if (elapsed < DURATION_MS) frame = requestAnimationFrame(tick);
      else done.current();
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, []);

  return <canvas ref={canvasRef} aria-hidden="true" className="fixed inset-0 z-[90] pointer-events-none" style={{ width: "100vw", height: "100vh" }} />;
}
