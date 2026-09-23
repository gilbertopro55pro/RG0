"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { CURRENT_VERSION } from "@/lib/changelog";
import GlassTabStrip from "@/components/GlassTabStrip";
import { IconHome, IconGallery, IconLink, IconLeads, IconWaitlist, IconAnalytics, IconSettings } from "@/components/icons/NavIcons";

// Single-color line icons (the gradient badges were retired with the pastel palette, 2026-09-23);
// the active page is marked by GlassTabStrip's brass tint and indicator.
const NAV_ITEMS = [
  { href: "/", label: "בית", icon: IconHome },
  { href: "/galleries", label: "גלריות", icon: IconGallery },
  { href: "/client-portals", label: "פורטל לקוח", icon: IconLink },
  { href: "/leads", label: "לידים ופניות", icon: IconLeads },
  { href: "/waitlist", label: "רשימת המתנה", icon: IconWaitlist },
  { href: "/analytics", label: "דשבורד", icon: IconAnalytics },
  { href: "/settings", label: "הגדרות", icon: IconSettings },
] as const;

// Client-facing token pages and pre-auth screens have no dashboard shortcuts to show. "/landing"
// is here even though no link ever points at it directly — middleware.ts rewrites anonymous hits
// on "/" to this static route (to skip the auth round trip), which is invisible in the browser's
// URL bar but not to usePathname(): during SSR (and apparently past hydration too, confirmed live
// — this isn't just a pre-hydration flash) it reports the REWRITTEN path, "/landing", not the "/"
// the visitor actually requested. Without this entry the dashboard nav bar rendered on top of the
// marketing page for every logged-out visitor hitting "/".
// "/p" (the public portfolio, /p/[slug]) added 2026-09-23 — it had been showing the photographer's
// own dashboard nav to every potential client who opened a shared portfolio link.
const HIDDEN_PREFIXES = ["/login", "/signup", "/gallery", "/contracts", "/portal", "/quotes", "/billing", "/landing", "/p"];

export default function TopNav() {
  const pathname = usePathname();
  const [settingsBadgeCount, setSettingsBadgeCount] = useState(0);

  // Combines two unrelated "you have something to look at" signals into one number on the
  // settings tile: unread client-initiated event activity (same data as the per-event badges
  // on the dashboard, just summed instead of shown per card) plus 1 if there's an app update
  // the user hasn't opened the "מה חדש" popup/tab for yet.
  useEffect(() => {
    let cancelled = false;
    let unreadEvents = 0;

    const recomputeBadge = () => {
      let hasUnseenUpdate = false;
      try {
        hasUnseenUpdate = localStorage.getItem("changelog-seen-version") !== CURRENT_VERSION;
      } catch {}
      setSettingsBadgeCount(unreadEvents + (hasUnseenUpdate ? 1 : 0));
    };

    fetch("/api/notifications/summary")
      .then((res) => res.json())
      .then((data: { unreadEvents: number }) => {
        if (cancelled) return;
        unreadEvents = data.unreadEvents ?? 0;
        recomputeBadge();
      })
      .catch(() => {});

    // Fired by ChangelogModal on dismiss — without this the badge only clears on the next full
    // page load, since the count above is otherwise only computed once on mount.
    window.addEventListener("changelog-seen-change", recomputeBadge);
    return () => {
      cancelled = true;
      window.removeEventListener("changelog-seen-change", recomputeBadge);
    };
  }, []);

  const isHidden =
    pathname === "/" || HIDDEN_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  if (isHidden) return null;

  return (
    <div
      className="sticky top-0 z-30 border-b"
      style={{
        background: "var(--color-nav-bg)",
        backdropFilter: "blur(28px) saturate(180%)",
        WebkitBackdropFilter: "blur(28px) saturate(180%)",
        borderColor: "var(--color-line)",
      }}
    >
      <nav className="px-3 py-2 mx-auto w-full md:w-[90%] lg:w-[80%]">
        <GlassTabStrip
          items={NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            return {
              key: item.href,
              label: item.label,
              href: item.href,
              active: pathname === item.href || pathname.startsWith(`${item.href}/`),
              badge: item.href === "/settings" ? settingsBadgeCount : undefined,
              icon: <Icon className="h-[19px] w-[19px]" />,
              hideLabel: true,
            };
          })}
        />
      </nav>
    </div>
  );
}
