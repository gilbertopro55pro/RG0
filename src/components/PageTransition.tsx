"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

// A short fade-in of the page content on every in-app navigation (not on the first load — the
// boot splash covers that). Opacity only, on purpose: animating a transform on this wrapper would
// make it the containing block for every position:fixed pop-up inside the page for the duration.
// The wrapper is a plain flex column so pages keep laying out exactly as they did as direct
// children of <body>.
export default function PageTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const ref = useRef<HTMLDivElement>(null);
  const firstRender = useRef(true);

  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    const el = ref.current;
    if (!el || typeof el.animate !== "function") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    // Short and from half opacity: the new screen must read as already there, not as arriving.
    el.animate([{ opacity: 0.55 }, { opacity: 1 }], { duration: 160, easing: "cubic-bezier(0.16, 1, 0.3, 1)" });
  }, [pathname]);

  return (
    <div ref={ref} className="flex flex-1 flex-col w-full">
      {children}
    </div>
  );
}
