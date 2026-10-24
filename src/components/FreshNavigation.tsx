"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { takeDataChanged } from "@/lib/dataChanges";

// A screen visited in the last minute opens from the router's memory (experimental.staleTimes in
// next.config.ts). After anything was saved (lib/dataChanges.ts), the next navigation drops those
// saved copies first: a tap on a link calls router.refresh() just before the link navigates (this
// listener runs in the capture phase, before Link's own click handler), so the screen it opens is
// fetched fresh. A navigation from code (router.push after a save, Back) refreshes the screen it
// opened, unless that code already did (refreshIfDataChanged).
export default function FreshNavigation() {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const link = (e.target as Element | null)?.closest?.("a[href]");
      if (!(link instanceof HTMLAnchorElement)) return;
      if ((link.target && link.target !== "_self") || link.hasAttribute("download")) return;
      const url = new URL(link.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      if (url.pathname === window.location.pathname && url.search === window.location.search) return;
      if (takeDataChanged()) router.refresh();
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [router]);

  useEffect(() => {
    if (takeDataChanged()) router.refresh();
  }, [pathname, router]);

  return null;
}
