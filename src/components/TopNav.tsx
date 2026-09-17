"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { CURRENT_VERSION } from "@/lib/changelog";
import GlassTabStrip from "@/components/GlassTabStrip";
import { IconHome, IconGallery, IconLink, IconLeads, IconWaitlist, IconAnalytics, IconSettings } from "@/components/icons/NavIcons";

// Round gradient badges restored on top of the glass-strip layout (dividers + sliding indicator)
// — richer, deeper gradients than the original flat-pastel badges so they read as premium rather
// than playful; the strip's own shadow/divider treatment is what carries the "glass" identity now,
// so the badges themselves lean toward jewel-toned depth instead of pastel.
const NAV_ITEMS = [
  { href: "/", label: "בית", icon: IconHome, iconBg: "linear-gradient(150deg, #4b4b5e, #201f33)" },
  { href: "/galleries", label: "גלריות", icon: IconGallery, iconBg: "linear-gradient(150deg, var(--color-sage), var(--color-lime-deep))" },
  { href: "/client-portals", label: "פורטל לקוח", icon: IconLink, iconBg: "linear-gradient(150deg, var(--color-coral), var(--color-coral-deep))" },
  { href: "/leads", label: "לידים ופניות", icon: IconLeads, iconBg: "linear-gradient(150deg, var(--color-lime), var(--color-lime-deep))" },
  { href: "/waitlist", label: "רשימת המתנה", icon: IconWaitlist, iconBg: "linear-gradient(150deg, var(--color-peach), #c9772f)" },
  { href: "/analytics", label: "דשבורד", icon: IconAnalytics, iconBg: "linear-gradient(150deg, var(--color-amber), var(--color-amber-deep))" },
  { href: "/settings", label: "הגדרות", icon: IconSettings, iconBg: "linear-gradient(150deg, #8d89ab, #5c5875)" },
] as const;

// Client-facing token pages and pre-auth screens have no dashboard shortcuts to show. "/landing"
// is here even though no link ever points at it directly — middleware.ts rewrites anonymous hits
// on "/" to this static route (to skip the auth round trip), which is invisible in the browser's
// URL bar but not to usePathname(): during SSR (and apparently past hydration too, confirmed live
// — this isn't just a pre-hydration flash) it reports the REWRITTEN path, "/landing", not the "/"
// the visitor actually requested. Without this entry the dashboard nav bar rendered on top of the
// marketing page for every logged-out visitor hitting "/".
const HIDDEN_PREFIXES = ["/login", "/signup", "/gallery", "/contracts", "/portal", "/quotes", "/billing", "/landing"];

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
              icon: <Icon className="h-3.5 w-3.5" />,
              iconBg: item.iconBg,
              hideLabel: true,
            };
          })}
        />
      </nav>
    </div>
  );
}
