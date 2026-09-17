"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { IconGallery, IconLink, IconLeads, IconWaitlist, IconAnalytics, IconCalculator } from "@/components/icons/NavIcons";
import type { PriceQuoteRow, PriceQuoteTemplateRow, PricingSupplier } from "@/lib/types";

const EventPricingCalculator = dynamic(() => import("@/components/EventPricingCalculator"), { ssr: false });

// Same glass-pill + small colored icon-badge language as TopNav, laid out as a spacious grid
// instead of a cramped sidebar column — the shortcuts a photographer actually taps often.
// Google Calendar moved out of this grid to sit next to the "+ אירוע חדש" button instead; Settings
// moved out to a gear icon next to the page title instead of a grid tile.
const ACTIONS = [
  { href: "/galleries", label: "גלריות", icon: IconGallery, badge: "linear-gradient(135deg, var(--color-sage), var(--color-lime-deep))" },
  { href: "/client-portals", label: "פורטל לקוח", icon: IconLink, badge: "linear-gradient(135deg, var(--color-coral), var(--color-coral-deep))" },
  { href: "/leads", label: "לידים ופניות", icon: IconLeads, badge: "linear-gradient(135deg, var(--color-lime), var(--color-lime-deep))" },
  { href: "/waitlist", label: "רשימת המתנה", icon: IconWaitlist, badge: "linear-gradient(135deg, var(--color-peach), #d98a4a)" },
  { href: "/analytics", label: "דשבורד", icon: IconAnalytics, badge: "linear-gradient(135deg, #8a90ff, #5e5ce6)" },
] as const;

export default function QuickActionsGrid({
  hourlyRate,
  suppliers,
  priceQuotes,
  templates,
  eventTypes,
  initialCustomEventTypes,
  defaultTaxStatus,
}: {
  hourlyRate: number;
  suppliers: PricingSupplier[];
  priceQuotes: PriceQuoteRow[];
  templates: PriceQuoteTemplateRow[];
  eventTypes: { id: string; name: string }[];
  initialCustomEventTypes: string[];
  defaultTaxStatus: "exempt" | "licensed";
}) {
  const [calculatorOpen, setCalculatorOpen] = useState(false);

  return (
    <>
      <div className="grid grid-cols-3 lg:grid-cols-6 gap-2.5 mb-5">
        <button
          onClick={() => setCalculatorOpen(true)}
          className="nav-tile relative rounded-2xl p-3 flex flex-col items-center justify-center gap-1.5 text-center bg-card shadow-card"
        >
          <span
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
            style={{ background: "linear-gradient(135deg, var(--color-amber-deep), #6f6ce6)", color: "#ffffff" }}
          >
            <IconCalculator className="h-4 w-4" />
          </span>
          <span className="text-[11px] font-semibold leading-tight">בונה הצעות מחיר</span>
        </button>
        {ACTIONS.map((item) => {
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className="nav-tile relative rounded-2xl p-3 flex flex-col items-center justify-center gap-1.5 text-center bg-card shadow-card"
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
      {calculatorOpen && (
        <EventPricingCalculator
          hourlyRate={hourlyRate}
          suppliers={suppliers}
          priceQuotes={priceQuotes}
          templates={templates}
          eventTypes={eventTypes}
          initialCustomEventTypes={initialCustomEventTypes}
          defaultTaxStatus={defaultTaxStatus}
          onClose={() => setCalculatorOpen(false)}
        />
      )}
    </>
  );
}
