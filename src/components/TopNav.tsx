"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { IconHome, IconGallery, IconLink, IconLeads, IconWaitlist, IconAnalytics, IconSettings } from "@/components/icons/NavIcons";

// One shared glass-pill treatment for every tile — only the small icon badge carries color, so
// the row reads as a cohesive, muted set of shortcuts rather than a strip of rainbow buttons.
const NAV_ITEMS = [
  { href: "/", label: "בית", icon: IconHome, badge: "linear-gradient(135deg, #6b6b80, var(--color-ink))" },
  { href: "/galleries", label: "גלריות", icon: IconGallery, badge: "linear-gradient(135deg, var(--color-sage), var(--color-lime-deep))" },
  { href: "/client-portals", label: "פורטל לקוח", icon: IconLink, badge: "linear-gradient(135deg, var(--color-coral), var(--color-coral-deep))" },
  { href: "/leads", label: "לידים ופניות", icon: IconLeads, badge: "linear-gradient(135deg, var(--color-lime), var(--color-lime-deep))" },
  { href: "/waitlist", label: "רשימת המתנה", icon: IconWaitlist, badge: "linear-gradient(135deg, var(--color-peach), #d98a4a)" },
  { href: "/analytics", label: "דשבורד", icon: IconAnalytics, badge: "linear-gradient(135deg, #8a90ff, #5e5ce6)" },
  { href: "/settings", label: "הגדרות", icon: IconSettings, badge: "linear-gradient(135deg, #9a97b8, #6f6c8f)" },
] as const;

// Client-facing token pages and pre-auth screens have no dashboard shortcuts to show.
const HIDDEN_PREFIXES = ["/login", "/signup", "/gallery", "/contracts", "/portal", "/quotes", "/billing"];

export default function TopNav() {
  const pathname = usePathname();

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
      {/* 87% on mobile is a deliberate exact width so all 7 icon-only tiles fit with no side
          scroll — labels only appear from md: up, where there's room for them. */}
      <nav className="flex items-center justify-between md:justify-center gap-1 md:gap-2 px-1 md:px-3 py-1.5 md:py-2.5 mx-auto w-[87%] md:w-[90%] lg:w-[80%]">
        {NAV_ITEMS.map((item) => {
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className="nav-tile shrink-0 flex items-center justify-center md:justify-start h-8 w-8 md:h-auto md:w-auto gap-0 md:gap-1.5 rounded-full md:pl-3 md:pr-1.5 md:py-1 text-xs font-semibold whitespace-nowrap"
              style={{
                background: active ? "rgba(255,255,255,0.85)" : "rgba(255,255,255,0.4)",
                border: `1px solid ${active ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.5)"}`,
                color: "var(--color-ink)",
                boxShadow: active ? "0 4px 14px rgba(88,76,158,0.14)" : "none",
              }}
            >
              <span
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full"
                style={{ background: item.badge, color: "#ffffff" }}
              >
                <Icon className="h-3.5 w-3.5 shrink-0" />
              </span>
              <span className="hidden md:inline">{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
