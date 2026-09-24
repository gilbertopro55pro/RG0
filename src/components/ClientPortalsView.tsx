"use client";

import { useState } from "react";

import { packageLabel } from "@/lib/stages";
import type { EventRow } from "@/lib/types";
import PageGuide from "@/components/PageGuide";
import BackLink from "@/components/BackLink";

const HE_MONTHS_SHORT = ["ינו׳", "פבר׳", "מרץ", "אפר׳", "מאי", "יוני", "יולי", "אוג׳", "ספט׳", "אוק׳", "נוב׳", "דצמ׳"];

type EventWithCustomPackage = EventRow & { custom_packages: { name: string } | null };

export default function ClientPortalsView({ events }: { events: EventWithCustomPackage[] }) {
  return (
    <div className="pb-8">
      <BackLink href="/" label="חזרה לדף הבית" className="mb-5" />
      <h1 className="text-[26px] font-bold mb-1.5 font-display">פורטל לקוח</h1>
      <PageGuide
        pageKey="client-portals"
        blurb="לכל אירוע יש קישור אישי שהלקוח/ה יכולים לפתוח כדי לראות סטטוס ותשלומים, בלי להתחבר."
      />

      {events.length === 0 && <div className="text-center py-16 text-sm text-ink-soft">עדיין אין אירועים</div>}

      {/* Design stage 5: one list with a date column (same as the home screen's events list),
          not a card per event. */}
      {events.length > 0 && (
        <div className="rounded-2xl bg-card overflow-hidden divide-y divide-[var(--color-line)]">
          {events.map((event) => (
            <PortalRow key={event.id} event={event} />
          ))}
        </div>
      )}
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

  const [y, m, d] = event.event_date.split("-").map(Number);
  const showYear = y !== new Date().getFullYear();

  return (
    <div className="flex items-center gap-3 px-3.5 py-3">
      <div className="w-11 shrink-0 text-center border-e border-line pe-3 box-content">
        <div className="text-xl leading-none font-bold font-data">{d}</div>
        <div className="text-[11px] text-ink-soft mt-1">
          {HE_MONTHS_SHORT[m - 1]}
          {showYear && <span className="font-data"> {String(y).slice(2)}</span>}
        </div>
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-bold text-[15px] truncate">{event.client_name}</div>
        <div className="text-[13px] text-ink-soft truncate">{packageLabel(event.package, event.custom_packages?.name)}</div>
      </div>
      <button
        onClick={copyLink}
        className="shrink-0 text-[13px] font-bold h-9 px-3 rounded-lg bg-white border border-line text-ink"
      >
        {copied ? "הועתק" : "העתקת קישור"}
      </button>
    </div>
  );
}
