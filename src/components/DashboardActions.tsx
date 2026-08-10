"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import type { CustomPackageRow, EventTypeRow, PackagePriceRow } from "@/lib/types";
import { IconCalendar } from "@/components/icons/NavIcons";

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
    <div className="flex items-center gap-2">
      <Link
        href="/calendar"
        aria-label="יומן Google"
        title="יומן Google"
        className="h-10 w-10 rounded-full flex items-center justify-center bg-card border border-line shadow-card text-ink"
      >
        <IconCalendar className="h-4 w-4" />
      </Link>
      <button
        onClick={() => setOpen(true)}
        aria-label="הוספת אירוע חדש"
        className="h-10 rounded-full flex items-center gap-1.5 px-4 bg-ink shadow-card text-white text-sm font-semibold whitespace-nowrap"
      >
        <span className="text-lg leading-none">+</span>
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
    </div>
  );
}
