"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import type { CustomPackageRow, EventTypeRow, PackagePriceRow } from "@/lib/types";
import { IconCalendar } from "@/components/icons/NavIcons";
import { useT } from "@/i18n/client";
import { useVivid } from "@/components/VividProvider";
import { VIVID_HEADER_BUTTON, VIVID_HEADER_BUTTON_STYLE } from "@/components/homeVividStyles";

function IconPlus({ className, strokeWidth = 2 }: { className?: string; strokeWidth?: number }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" aria-hidden="true">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

const NewEventModal = dynamic(() => import("@/components/NewEventModal"), { ssr: false });

export default function NewEventButton({
  customPackages,
  eventTypes,
  prices,
}: {
  customPackages: CustomPackageRow[];
  eventTypes?: EventTypeRow[];
  prices?: PackagePriceRow[];
}) {
  const t = useT();
  const vivid = useVivid();
  const [open, setOpen] = useState(false);

  return (
    <>
      {vivid ? (
        // The vivid look (lib/tones.ts, admin only for now): the dark of the next-shoot card with an
        // inner highlight, the plus in a gold circle. Dark in both themes, like that card.
        <button
          onClick={() => setOpen(true)}
          className="w-full h-[52px] mb-4 rounded-xl flex items-center justify-center gap-2.5 text-[15px] font-semibold"
          style={{
            background: "linear-gradient(180deg, var(--vivid-hero-a), var(--vivid-hero-b))",
            border: "1px solid color-mix(in srgb, var(--vivid-foil) 22%, transparent)",
            boxShadow: "inset 0 1px 0 rgba(255, 255, 255, 0.12), 0 10px 24px rgba(var(--shadow-tint), 0.22)",
            color: "#ffffff",
          }}
        >
          <span className="h-[26px] w-[26px] rounded-full flex items-center justify-center shrink-0" style={{ background: "var(--vivid-foil)", color: "var(--vivid-hero-b)" }}>
            <IconPlus className="h-[15px] w-[15px]" strokeWidth={2.4} />
          </span>
          {t("אירוע חדש")}
        </button>
      ) : (
        <button
          onClick={() => setOpen(true)}
          className="w-full h-12 mb-4 rounded-xl flex items-center justify-center gap-2 bg-ink text-white text-[15px] font-semibold"
        >
          <IconPlus className="h-[18px] w-[18px]" />
          {t("אירוע חדש")}
        </button>
      )}
      {open && (
        <NewEventModal
          onClose={() => setOpen(false)}
          customPackages={customPackages}
          eventTypes={eventTypes}
          prices={prices}
        />
      )}
    </>
  );
}

// Square glass icon button used in the home header (calendar, settings). Same size/shape as
// SettingsGearLink so the pair reads as one set.
export function CalendarLink() {
  const t = useT();
  const vivid = useVivid();
  return (
    <Link
      href="/calendar"
      aria-label={t("יומן Google")}
      title={t("יומן Google")}
      className={vivid ? VIVID_HEADER_BUTTON : "h-10 w-10 rounded-xl flex items-center justify-center bg-card text-ink"}
      style={vivid ? VIVID_HEADER_BUTTON_STYLE : undefined}
    >
      <IconCalendar className="h-[19px] w-[19px]" />
    </Link>
  );
}
