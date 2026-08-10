"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import type { CustomPackageRow, EventTypeRow, PackagePriceRow } from "@/lib/types";

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
        className="h-10 w-10 rounded-full flex items-center justify-center bg-ink shadow-card text-white text-xl leading-none"
      >
        +
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
