"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { IconGallery, IconLink, IconLeads, IconWaitlist, IconAnalytics, IconCalculator } from "@/components/icons/NavIcons";
import type { PriceQuoteRow, PriceQuoteTemplateRow, PricingSupplier } from "@/lib/types";

const EventPricingCalculator = dynamic(() => import("@/components/EventPricingCalculator"), { ssr: false });

// Shortcuts a photographer taps often: plain glass tiles with a single-color line icon (the
// colored gradient badges they used to carry were retired with the pastel palette, 2026-09-23).
// Icon on the start edge above the label, both start-aligned — reads as a list of tools rather
// than a grid of app icons. Google Calendar and Settings live in the page header instead.
const ACTIONS = [
  { href: "/galleries", label: "גלריות", icon: IconGallery },
  { href: "/client-portals", label: "פורטל לקוח", icon: IconLink },
  { href: "/leads", label: "לידים ופניות", icon: IconLeads },
  { href: "/waitlist", label: "רשימת המתנה", icon: IconWaitlist },
  { href: "/analytics", label: "דשבורד", icon: IconAnalytics },
] as const;

// Design stage 5: one grouped block split by hairlines (the container's line color shows through
// the 1px gaps), not six separate floating cards.
const TILE = "px-3.5 py-3.5 flex flex-col items-start gap-2 text-start";
const TILE_STYLE = { background: "var(--color-cell)" };

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
      <nav
        aria-label="כלים"
        className="grid grid-cols-3 lg:grid-cols-6 gap-px mb-6 rounded-2xl overflow-hidden border border-line"
        style={{ background: "var(--color-line)" }}
      >
        <button onClick={() => setCalculatorOpen(true)} data-press="tint" className={TILE} style={TILE_STYLE}>
          <span style={{ color: "var(--color-brass)" }}>
            <IconCalculator className="h-5 w-5" />
          </span>
          <span className="text-[13px] font-medium leading-tight">הצעות מחיר</span>
        </button>
        {ACTIONS.map((item) => {
          const Icon = item.icon;
          return (
            <Link key={item.href} href={item.href} data-press="tint" className={TILE} style={TILE_STYLE}>
              <span style={{ color: "var(--color-brass)" }}>
                <Icon className="h-5 w-5" />
              </span>
              <span className="text-[13px] font-medium leading-tight">{item.label}</span>
            </Link>
          );
        })}
      </nav>
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
