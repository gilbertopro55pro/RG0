"use client";

import { useState } from "react";
import { IconClose } from "@/components/icons/AlbumIcons";

// Settings → "מדריכים": every recorded guide video in one place. The per-page videos are the same
// files PageGuide.tsx opens on each screen (/guides/<key>.mp4); overview/portfolio/settings exist
// only here, since they don't belong to a single page.
const GUIDES: { key: string; title: string; description: string; duration: string }[] = [
  { key: "overview", title: "סיור במערכת", description: "מסך הבית, כרטיס אירוע, והמעבר בין כל המסכים", duration: "1:29" },
  { key: "portfolio", title: "פורטפוליו", description: "העלאת תמונות, הוספת גלריות ותמונות, ושיתוף ללקוחות", duration: "1:24" },
  { key: "settings", title: "הגדרות", description: "מה יש בכל אחד מנושאי ההגדרות", duration: "1:20" },
  { key: "galleries", title: "גלריות", description: "יצירת גלריה, העלאת תמונות ושליחה ללקוח", duration: "0:45" },
  { key: "client-portals", title: "פורטל לקוח", description: "הקישור האישי ומה הלקוח רואה בו", duration: "0:36" },
  { key: "leads", title: "לידים ופניות", description: "מעקב פניות, הצעות מחיר והמרה לאירוע", duration: "0:36" },
  { key: "waitlist", title: "רשימת המתנה", description: "לקוחות לתאריכים תפוסים, והמרה לאירוע", duration: "0:31" },
  { key: "analytics", title: "דשבורד עסקי", description: "הכנסות, מגמות, ותשלומים פתוחים", duration: "0:40" },
];

export default function GuidesSettings() {
  const [open, setOpen] = useState<(typeof GUIDES)[number] | null>(null);

  return (
    <div className="rounded-2xl bg-card border border-line shadow-card overflow-hidden">
      <div className="p-4 pb-3">
        <div className="text-sm font-semibold mb-1">סרטוני הדרכה</div>
        <p className="text-xs text-ink-soft">סרטונים קצרים על כל חלקי המערכת. לחיצה על סרטון פותחת אותו.</p>
      </div>
      <ul>
        {GUIDES.map((g) => (
          <li key={g.key} className="border-t border-line">
            <button
              data-press="tint"
              onClick={() => setOpen(g)}
              className="w-full flex items-center gap-3 px-4 py-3 text-right"
            >
              <span
                className="h-9 w-9 rounded-full flex items-center justify-center shrink-0"
                style={{ background: "var(--color-chip)", color: "var(--color-amber-deep)" }}
                aria-hidden
              >
                <svg width={14} height={14} viewBox="0 0 24 24" fill="currentColor">
                  <path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.5-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5z" />
                </svg>
              </span>
              <span className="flex-1 min-w-0">
                <span className="block text-sm font-semibold">{g.title}</span>
                <span className="block text-xs text-ink-soft truncate">{g.description}</span>
              </span>
              <span className="text-xs font-data text-ink-soft shrink-0">{g.duration}</span>
            </button>
          </li>
        ))}
      </ul>

      {open && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center p-4"
          style={{ background: "rgba(28, 27, 25, 0.55)", backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)" }}
          onClick={() => setOpen(null)}
        >
          <div
            className="w-full max-w-sm rounded-3xl bg-paper shadow-sheet max-h-[90vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-4 pb-3 shrink-0">
              <h2 className="text-base font-bold font-display">{open.title}</h2>
              <button
                onClick={() => setOpen(null)}
                className="h-8 w-8 rounded-full flex items-center justify-center border border-line shrink-0"
                style={{ background: "var(--color-input-bg)" }}
                aria-label="סגירה"
              >
                <IconClose className="h-4 w-4" />
              </button>
            </div>
            <div className="px-4 pb-4 overflow-y-auto">
              <div className="rounded-xl overflow-hidden border border-line bg-black">
                <video key={open.key} src={`/guides/${open.key}.mp4`} controls autoPlay playsInline className="w-full h-auto block max-h-[70vh]" />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
