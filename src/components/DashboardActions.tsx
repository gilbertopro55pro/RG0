"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import type { CustomPackageRow, EventTypeRow, PackagePriceRow } from "@/lib/types";
import { IconCalendar } from "@/components/icons/NavIcons";

function IconPlus({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden="true">
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
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="w-full h-12 mb-4 rounded-xl flex items-center justify-center gap-2 bg-ink text-white text-[15px] font-semibold"
      >
        <IconPlus className="h-[18px] w-[18px]" />
        אירוע חדש
      </button>
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
  return (
    <Link
      href="/calendar"
      aria-label="יומן Google"
      title="יומן Google"
      className="h-10 w-10 rounded-xl flex items-center justify-center bg-card text-ink"
    >
      <IconCalendar className="h-[19px] w-[19px]" />
    </Link>
  );
}
