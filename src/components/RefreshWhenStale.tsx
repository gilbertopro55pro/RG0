"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// Keeps a server-rendered screen (the home screen) current (owner, 2026-10-08): after marking
// "יום הצילום" on a morning shoot and going back, the home screen still led with that shoot, since
// going back shows the router's saved copy of the page. Each server render carries a fresh
// renderId; when the same one is shown again more than a few seconds after it first appeared
// (a saved copy), or the app comes back after a minute in the background, the page is reloaded
// from the server. Times are this device's own clock only, so the server's clock never matters.
const firstSeen = new Map<string, number>();
const SAVED_COPY_MS = 5_000;
const BACKGROUND_MS = 60_000;

export default function RefreshWhenStale({ renderId }: { renderId: string }) {
  const router = useRouter();

  useEffect(() => {
    const seen = firstSeen.get(renderId);
    if (seen === undefined) firstSeen.set(renderId, Date.now());
    else if (Date.now() - seen > SAVED_COPY_MS) router.refresh();
  }, [renderId, router]);

  useEffect(() => {
    let hiddenAt = 0;
    const onVisibility = () => {
      if (document.visibilityState === "hidden") hiddenAt = Date.now();
      else if (hiddenAt && Date.now() - hiddenAt > BACKGROUND_MS) router.refresh();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [router]);

  return null;
}
