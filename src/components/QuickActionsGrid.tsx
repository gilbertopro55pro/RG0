import Link from "next/link";
import { IconGallery, IconLink, IconLeads, IconWaitlist, IconAnalytics, IconSettings, IconCalendar } from "@/components/icons/NavIcons";

// Same glass-pill + small colored icon-badge language as TopNav, laid out as a spacious grid
// instead of a cramped sidebar column — the shortcuts a photographer actually taps often.
const ACTIONS = [
  { href: "/galleries", label: "גלריות", icon: IconGallery, badge: "linear-gradient(135deg, var(--color-sage), var(--color-lime-deep))" },
  { href: "/client-portals", label: "פורטל לקוח", icon: IconLink, badge: "linear-gradient(135deg, var(--color-coral), var(--color-coral-deep))" },
  { href: "/leads", label: "לידים ופניות", icon: IconLeads, badge: "linear-gradient(135deg, var(--color-lime), var(--color-lime-deep))" },
  { href: "/waitlist", label: "רשימת המתנה", icon: IconWaitlist, badge: "linear-gradient(135deg, var(--color-peach), #d98a4a)" },
  { href: "/calendar", label: "יומן Google", icon: IconCalendar, badge: "linear-gradient(135deg, #4a9dff, #2f6fd6)" },
  { href: "/analytics", label: "דשבורד", icon: IconAnalytics, badge: "linear-gradient(135deg, #8a90ff, #5e5ce6)" },
  { href: "/settings", label: "הגדרות", icon: IconSettings, badge: "linear-gradient(135deg, #9a97b8, #6f6c8f)" },
] as const;

export default function QuickActionsGrid() {
  return (
    <div className="grid grid-cols-3 lg:grid-cols-7 gap-2.5 mb-5">
      {ACTIONS.map((item) => {
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            className="nav-tile rounded-2xl p-3 flex flex-col items-center justify-center gap-1.5 text-center bg-card shadow-card"
          >
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
