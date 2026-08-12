"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { IconGallery, IconLink, IconLeads, IconWaitlist, IconAnalytics, IconSettings } from "@/components/icons/NavIcons";
import { CURRENT_VERSION } from "@/lib/changelog";

// Same glass-pill + small colored icon-badge language as TopNav, laid out as a spacious grid
// instead of a cramped sidebar column — the shortcuts a photographer actually taps often.
// Google Calendar moved out of this grid to sit next to the "+ אירוע חדש" button instead.
const ACTIONS = [
  { href: "/galleries", label: "גלריות", icon: IconGallery, badge: "linear-gradient(135deg, var(--color-sage), var(--color-lime-deep))" },
  { href: "/client-portals", label: "פורטל לקוח", icon: IconLink, badge: "linear-gradient(135deg, var(--color-coral), var(--color-coral-deep))" },
  { href: "/leads", label: "לידים ופניות", icon: IconLeads, badge: "linear-gradient(135deg, var(--color-lime), var(--color-lime-deep))" },
  { href: "/waitlist", label: "רשימת המתנה", icon: IconWaitlist, badge: "linear-gradient(135deg, var(--color-peach), #d98a4a)" },
  { href: "/analytics", label: "דשבורד", icon: IconAnalytics, badge: "linear-gradient(135deg, #8a90ff, #5e5ce6)" },
  { href: "/settings", label: "הגדרות", icon: IconSettings, badge: "linear-gradient(135deg, #9a97b8, #6f6c8f)" },
] as const;

export default function QuickActionsGrid() {
  const [hasUnseenUpdate, setHasUnseenUpdate] = useState(false);

  useEffect(() => {
    const recompute = () => {
      try {
        setHasUnseenUpdate(localStorage.getItem("changelog-seen-version") !== CURRENT_VERSION);
      } catch {}
    };
    recompute();
    // Fired by ChangelogModal on dismiss — same cross-component notify pattern TopNav uses.
    window.addEventListener("changelog-seen-change", recompute);
    return () => window.removeEventListener("changelog-seen-change", recompute);
  }, []);

  return (
    <div className="grid grid-cols-3 lg:grid-cols-6 gap-2.5 mb-5">
      {ACTIONS.map((item) => {
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            className="nav-tile relative rounded-2xl p-3 flex flex-col items-center justify-center gap-1.5 text-center bg-card shadow-card"
          >
            {item.href === "/settings" && hasUnseenUpdate && (
              <span
                className="absolute top-2 left-2 h-2.5 w-2.5 rounded-full shadow"
                style={{ background: "var(--color-rose)" }}
              />
            )}
            <span
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
              style={{ background: item.badge, color: "#ffffff" }}
            >
              <Icon className="h-4 w-4" />
            </span>
            <span className="text-[11px] font-semibold leading-tight">{item.label}</span>
          </Link>
        );
      })}
    </div>
  );
}
