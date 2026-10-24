"use client";

import { useEffect, useState } from "react";
import { fetchRequestOf, isDataChangingRequest, markDataChanged } from "@/lib/dataChanges";

// Patches window.fetch once to track in-flight request count, so a thin progress bar can show
// automatically for *any* network activity — API route calls and direct Supabase client calls
// alike (supabase-js is fetch-based under the hood) — without every component needing to wire
// up its own loading state. This is what makes "something is happening" visible even for
// actions that previously gave zero feedback while waiting on the server.
// The same patch notes every successful write (lib/dataChanges.ts), so the next navigation doesn't
// show a screen from the router's memory that the write made out of date.
let patched = false;
let activeCount = 0;
const listeners = new Set<(count: number) => void>();

function notify() {
  listeners.forEach((fn) => fn(activeCount));
}

function patchFetchOnce() {
  if (patched || typeof window === "undefined") return;
  patched = true;
  const originalFetch = window.fetch.bind(window);
  window.fetch = async (...args: Parameters<typeof fetch>) => {
    activeCount++;
    notify();
    try {
      const res = await originalFetch(...args);
      if (res.ok) {
        const { url, method } = fetchRequestOf(args[0], args[1]);
        if (isDataChangingRequest(url, method, window.location.origin)) markDataChanged();
      }
      return res;
    } finally {
      activeCount = Math.max(0, activeCount - 1);
      notify();
    }
  };
}

export default function GlobalLoadingBar() {
  const [active, setActive] = useState(false);

  useEffect(() => {
    patchFetchOnce();
    const onChange = (count: number) => setActive(count > 0);
    listeners.add(onChange);
    return () => {
      listeners.delete(onChange);
    };
  }, []);

  if (!active) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-[100] h-[3px] overflow-hidden bg-transparent pointer-events-none">
      <div
        className="h-full w-1/3"
        style={{
          background: "linear-gradient(90deg, transparent, var(--color-ink), transparent)",
          animation: "global-loading-slide 1s ease-in-out infinite",
        }}
      />
      <style>{`
        @keyframes global-loading-slide {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(300%); }
        }
      `}</style>
    </div>
  );
}
