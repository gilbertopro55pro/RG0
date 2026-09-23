"use client";

import { useState } from "react";
import Link from "next/link";
import { packageLabel } from "@/lib/stages";
import type { EventRow } from "@/lib/types";
import PageGuide from "@/components/PageGuide";

type EventWithCustomPackage = EventRow & { custom_packages: { name: string } | null };

export default function ClientPortalsView({ events }: { events: EventWithCustomPackage[] }) {
  return (
    <div className="pb-8">
      <Link href="/" className="flex items-center gap-1 text-sm mb-5 text-ink-soft">
        → חזרה לדף הבית
      </Link>
      <h1 className="text-[26px] font-bold mb-1.5 font-display">פורטל לקוח</h1>
      <PageGuide
        pageKey="client-portals"
        blurb="לכל אירוע יש קישור אישי שהלקוח/ה יכולים לפתוח כדי לראות סטטוס ותשלומים, בלי להתחבר."
      />

      {events.length === 0 && <div className="text-center py-16 text-sm text-ink-soft">עדיין אין אירועים</div>}

      <div className="space-y-3">
        {events.map((event) => (
          <PortalRow key={event.id} event={event} />
        ))}
      </div>
    </div>
  );
}

function PortalRow({ event }: { event: EventWithCustomPackage }) {
  const [copied, setCopied] = useState(false);

  const copyLink = async () => {
    const link = `${window.location.origin}/portal/${event.client_access_token}`;
    await navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="rounded-2xl p-4 bg-card border border-line shadow-card flex items-center justify-between gap-3">
      <div>
        <div className="font-semibold text-sm">{event.client_name}</div>
        <div className="text-xs text-ink-soft font-data">
          {new Date(event.event_date).toLocaleDateString("he-IL")} · {packageLabel(event.package, event.custom_packages?.name)}
        </div>
      </div>
      <button
        onClick={copyLink}
        className="shrink-0 text-xs font-medium px-3 py-2 rounded-lg bg-white border border-line text-ink"
      >
        {copied ? "הועתק ✓" : "העתקת קישור"}
      </button>
    </div>
  );
}
