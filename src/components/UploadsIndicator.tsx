"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useGalleryUploads } from "@/lib/galleryUploads";
import { useT } from "@/i18n/client";

// A small floating pill with the photo uploads running in the background (owner, 2026-10-09), on
// every app screen except the galleries list (each row there shows its own) and a gallery whose
// upload still has its progress modal open. Tapping it opens the galleries list.
export default function UploadsIndicator() {
  const t = useT();
  const pathname = usePathname() ?? "";
  const uploads = useGalleryUploads();
  if (uploads.length === 0 || pathname === "/galleries") return null;
  const active = uploads.filter((u) => u.phase === "queued" || u.phase === "uploading");
  if (active.some((u) => !u.background && pathname === `/galleries/${u.galleryId}`)) return null;

  const total = active.reduce((a, u) => a + u.total, 0);
  const done = active.reduce((a, u) => a + u.done, 0);
  const pct = active.length > 0 ? active.reduce((a, u) => a + u.pct * u.total, 0) / Math.max(1, total) : 100;
  const label =
    active.length === 0
      ? t("העלאת התמונות הסתיימה")
      : active.length === 1
        ? t("מעלה ל\"{title}\": {done} מתוך {total}", { title: active[0].galleryTitle, done, total })
        : t("מעלה ל-{n} גלריות: {done} מתוך {total}", { n: active.length, done, total });

  return (
    <div className="fixed inset-x-0 z-[60] flex justify-center px-4 pointer-events-none" style={{ bottom: "calc(16px + env(safe-area-inset-bottom, 0px))" }}>
      <Link
        href="/galleries"
        className="pointer-events-auto relative flex items-center gap-2.5 max-w-full overflow-hidden rounded-full ps-3.5 pe-4 py-2.5 bg-ink text-white shadow-sheet text-sm font-semibold"
        aria-live="polite"
      >
        {active.length > 0 ? (
          <span className="h-4 w-4 shrink-0 rounded-full border-2 border-white/30 border-t-white animate-spin" aria-hidden="true" />
        ) : (
          <svg viewBox="0 0 24 24" width={16} height={16} fill="none" stroke="currentColor" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M20 6L9 17l-5-5" />
          </svg>
        )}
        <span className="truncate">{label}</span>
        {active.length > 0 && <span className="shrink-0 font-data opacity-70">{Math.round(pct)}%</span>}
        <span className="absolute bottom-0 start-0 h-[3px] bg-white/60" style={{ width: `${pct}%` }} aria-hidden="true" />
      </Link>
    </div>
  );
}
