"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { IconGallery, IconLink, IconLeads, IconWaitlist, IconAnalytics, IconCalculator } from "@/components/icons/NavIcons";
import { useT } from "@/i18n/client";
import type { PriceQuoteRow, PriceQuoteTemplateRow, PricingSupplier } from "@/lib/types";
import { useVivid } from "@/components/VividProvider";
import { VIVID_ICON_BOX, vividIconStyle } from "@/components/homeVividStyles";
import { countBadge } from "@/lib/homeVivid";

const EventPricingCalculator = dynamic(() => import("@/components/EventPricingCalculator"), { ssr: false });

// Shortcuts a photographer taps often: plain glass tiles with a single-color line icon (the
// colored gradient badges they used to carry were retired with the pastel palette, 2026-09-23).
// Icon on the start edge above the label, both start-aligned — reads as a list of tools rather
// than a grid of app icons. Google Calendar and Settings live in the page header instead.
// `tone`: the icon's color in the vivid look (lib/tones.ts, admin only for now).
const ACTIONS = [
  { href: "/galleries", label: "גלריות", icon: IconGallery, tone: "creative" },
  { href: "/client-portals", label: "פורטל לקוח", icon: IconLink, tone: "upcoming" },
  { href: "/leads", label: "לידים ופניות", icon: IconLeads, tone: "pending" },
  { href: "/waitlist", label: "רשימת המתנה", icon: IconWaitlist, tone: "neutral" },
  { href: "/analytics", label: "דשבורד", icon: IconAnalytics, tone: "paid" },
] as const;

// Design stage 5: one grouped block split by hairlines (the container's line color shows through
// the 1px gaps), not six separate floating cards.
const TILE = "px-3.5 py-3.5 flex flex-col items-start gap-2 text-start";
const TILE_STYLE = { background: "var(--color-cell)" };
const VIVID_TILE = "px-3 py-3.5 flex flex-col items-start gap-2.5 text-start";

export default function QuickActionsGrid({
  hourlyRate,
  suppliers,
  priceQuotes,
  templates,
  eventTypes,
  initialCustomEventTypes,
  defaultTaxStatus,
  quoteExtras,
  clientLangPicker,
  cullingLink,
  newLeadsCount = 0,
}: {
  hourlyRate: number;
  suppliers: PricingSupplier[];
  priceQuotes: PriceQuoteRow[];
  templates: PriceQuoteTemplateRow[];
  eventTypes: { id: string; name: string }[];
  initialCustomEventTypes: string[];
  defaultTaxStatus: "exempt" | "licensed";
  quoteExtras?: boolean;
  clientLangPicker?: boolean;
  // Admin only: the photo-culling test (labelling + engine), one tap from home on the phone.
  cullingLink?: boolean;
  // The vivid look only: leads still "new" (lib/homeVivid.ts onlyNewLeads), a badge on לידים ופניות.
  newLeadsCount?: number;
}) {
  const t = useT();
  const vivid = useVivid();
  const [calculatorOpen, setCalculatorOpen] = useState(false);

  if (vivid) {
    const leadsBadge = countBadge(newLeadsCount);
    return (
      <>
        <nav
          aria-label={t("כלים")}
          className="grid grid-cols-3 lg:grid-cols-6 gap-px mb-[18px] rounded-2xl overflow-hidden border border-line"
          style={{ background: "var(--color-line)" }}
        >
          <button onClick={() => setCalculatorOpen(true)} data-press="tint" className={VIVID_TILE} style={TILE_STYLE}>
            <span className={VIVID_ICON_BOX} style={vividIconStyle("brass")}>
              <IconCalculator className="h-[18px] w-[18px]" />
            </span>
            <span className="text-[13px] font-semibold leading-tight">{t("הצעות מחיר")}</span>
          </button>
          {ACTIONS.map((item) => {
            const Icon = item.icon;
            const badge = item.href === "/leads" ? leadsBadge : null;
            return (
              <Link key={item.href} href={item.href} data-press="tint" className={VIVID_TILE} style={TILE_STYLE}>
                <span className="flex items-center gap-2 w-full">
                  <span className={VIVID_ICON_BOX} style={vividIconStyle(item.tone)}>
                    <Icon className="h-[18px] w-[18px]" />
                  </span>
                  {badge && (
                    <span
                      className="ms-auto min-w-5 h-5 px-1.5 rounded-full text-[11px] font-bold flex items-center justify-center leading-none font-data"
                      style={{ background: "var(--tone-attention)", color: "#ffffff" }}
                      title={t("פניות חדשות")}
                    >
                      {badge}
                    </span>
                  )}
                </span>
                <span className="text-[13px] font-semibold leading-tight">{t(item.label)}</span>
              </Link>
            );
          })}
          {cullingLink && (
            <Link href="/admin/culling" data-press="tint" className="px-3.5 py-3 flex items-center gap-2.5 text-start col-span-3 lg:col-span-6" style={TILE_STYLE}>
              <span className={VIVID_ICON_BOX} style={vividIconStyle("creative")}>
                <IconGallery className="h-[18px] w-[18px]" />
              </span>
              <span className="text-[13px] font-semibold leading-tight">{t("סינון תמונות: סימון ומדידה")}</span>
              <span className="text-[11px] text-ink-soft ms-auto">{t("אדמין")}</span>
            </Link>
          )}
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
            quoteExtras={quoteExtras}
            clientLangPicker={clientLangPicker}
            onClose={() => setCalculatorOpen(false)}
          />
        )}
      </>
    );
  }

  return (
    <>
      <nav
        aria-label={t("כלים")}
        className="grid grid-cols-3 lg:grid-cols-6 gap-px mb-6 rounded-2xl overflow-hidden border border-line"
        style={{ background: "var(--color-line)" }}
      >
        <button onClick={() => setCalculatorOpen(true)} data-press="tint" className={TILE} style={TILE_STYLE}>
          <span style={{ color: "var(--color-brass)" }}>
            <IconCalculator className="h-5 w-5" />
          </span>
          <span className="text-[13px] font-medium leading-tight">{t("הצעות מחיר")}</span>
        </button>
        {ACTIONS.map((item) => {
          const Icon = item.icon;
          return (
            <Link key={item.href} href={item.href} data-press="tint" className={TILE} style={TILE_STYLE}>
              <span style={{ color: "var(--color-brass)" }}>
                <Icon className="h-5 w-5" />
              </span>
              <span className="text-[13px] font-medium leading-tight">{t(item.label)}</span>
            </Link>
          );
        })}
        {cullingLink && (
          <Link href="/admin/culling" data-press="tint" className="px-3.5 py-3 flex items-center gap-2 text-start col-span-3 lg:col-span-6" style={TILE_STYLE}>
            <span style={{ color: "var(--color-brass)" }}>
              <IconGallery className="h-5 w-5" />
            </span>
            <span className="text-[13px] font-medium leading-tight">{t("סינון תמונות: סימון ומדידה")}</span>
            <span className="text-[11px] text-ink-soft ms-auto">{t("אדמין")}</span>
          </Link>
        )}
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
          quoteExtras={quoteExtras}
          clientLangPicker={clientLangPicker}
          onClose={() => setCalculatorOpen(false)}
        />
      )}
    </>
  );
}
