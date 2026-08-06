"use client";

import { useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import type { CustomPackageRow, WaitlistRow } from "@/lib/types";

const NewEventModal = dynamic(() => import("@/components/NewEventModal"), { ssr: false });

export default function WaitlistView({
  initialEntries,
  customPackages,
}: {
  initialEntries: WaitlistRow[];
  customPackages: CustomPackageRow[];
}) {
  const [entries, setEntries] = useState(initialEntries);
  const [convertEntry, setConvertEntry] = useState<WaitlistRow | null>(null);

  const remove = async (id: string) => {
    setEntries((prev) => prev.filter((e) => e.id !== id));
    await fetch(`/api/waitlist/${id}`, { method: "DELETE" });
  };

  return (
    <div className="pb-8">
      <Link href="/" className="flex items-center gap-1 text-sm mb-5 tracking-wide text-ink-soft">
        ← חזרה לדף הבית
      </Link>
      <h1 className="text-[26px] font-bold mb-5 font-display">רשימת המתנה</h1>

      {entries.length === 0 && (
        <div className="text-center py-16 text-sm text-ink-soft">
          אין ממתינים כרגע — כשלקוח מבקש תאריך שכבר תפוס תופיע כאן אפשרות להוסיף אותו לרשימה
        </div>
      )}

      <div className="space-y-3">
        {entries.map((entry) => (
          <div key={entry.id} className="rounded-2xl p-4 bg-card border border-line shadow-card">
            <div className="flex items-start justify-between gap-2 mb-2.5">
              <div>
                <div className="font-semibold text-sm">{entry.client_name}</div>
                <div className="text-xs text-ink-soft font-data">
                  {new Date(entry.requested_date).toLocaleDateString("he-IL")}
                  {entry.client_phone && ` · ${entry.client_phone}`}
                </div>
              </div>
            </div>
            {entry.notes && <p className="text-xs text-ink-soft mb-2.5">{entry.notes}</p>}
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setConvertEntry(entry)}
                className="text-xs font-medium px-3 py-1.5 rounded-lg bg-ink text-white"
              >
                התאריך התפנה — יצירת אירוע
              </button>
              <button onClick={() => remove(entry.id)} className="text-xs font-medium px-3 py-1.5 rounded-lg text-rose">
                הסרה מהרשימה
              </button>
            </div>
          </div>
        ))}
      </div>

      {convertEntry && (
        <NewEventModal
          onClose={() => setConvertEntry(null)}
          waitlistId={convertEntry.id}
          customPackages={customPackages}
          initial={{
            clientName: convertEntry.client_name,
            clientPhone: convertEntry.client_phone ?? undefined,
            eventDate: convertEntry.requested_date,
          }}
        />
      )}
    </div>
  );
}
