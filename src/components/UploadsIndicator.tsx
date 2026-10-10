"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { isUploadActive, useGalleryUploads, type GalleryUpload } from "@/lib/galleryUploads";
import { useT } from "@/i18n/client";

// A small floating pill with the uploads running in the background (owner, 2026-10-09 for gallery
// photos, 2026-10-10 for every upload), on every app screen except the one that already shows that
// upload: the galleries list (each row shows its gallery's photos or videos), a gallery whose
// upload still has its progress modal open or whose videos are uploading, the portfolio settings,
// and the event whose album PDF is uploading. Tapping it opens the upload's screen. An album PDF
// that finished elsewhere stays here until the event page sends it to the client.
export default function UploadsIndicator() {
  const t = useT();
  const pathname = usePathname() ?? "";
  const uploads = useGalleryUploads();
  const shownHere = (u: GalleryUpload) =>
    ((u.kind === "photos" || u.kind === "videos") && pathname === "/galleries") || (pathname === u.href.split("?")[0] && !u.background);
  const visible = uploads.filter((u) => !shownHere(u));
  if (visible.length === 0) return null;
  const active = visible.filter(isUploadActive);
  const albumReady = visible.find((u) => u.kind === "album-pdf" && !isUploadActive(u) && u.result);
  const troubled = visible.find((u) => !isUploadActive(u) && (u.phase === "offline" || u.failed.length > 0));

  const total = active.reduce((a, u) => a + u.total, 0);
  const done = active.reduce((a, u) => a + u.done, 0);
  const pct = active.length > 0 ? active.reduce((a, u) => a + u.pct * u.total, 0) / Math.max(1, total) : 100;
  const onlyPhotos = (list: GalleryUpload[]) => list.every((u) => u.kind === "photos");

  const activeLabel = (u: GalleryUpload) =>
    u.kind === "portfolio"
      ? t("מעלה לפורטפוליו: {done} מתוך {total}", { done: u.done, total: u.total })
      : u.kind === "videos"
        ? t("מעלה סרטונים ל\"{title}\": {done} מתוך {total}", { title: u.title, done: u.done, total: u.total })
        : u.kind === "album-pdf"
          ? t("מעלה את עיצוב האלבום של {title}", { title: u.title })
          : t("מעלה ל\"{title}\": {done} מתוך {total}", { title: u.title, done: u.done, total: u.total });

  let label: string;
  let href: string;
  if (active.length === 1) {
    label = activeLabel(active[0]);
    href = active[0].href;
  } else if (active.length > 1) {
    label = onlyPhotos(active) ? t("מעלה ל-{n} גלריות: {done} מתוך {total}", { n: active.length, done, total }) : t("{n} העלאות פעילות", { n: active.length });
    href = active.every((u) => u.kind === "photos" || u.kind === "videos") ? "/galleries" : active[0].href;
  } else if (albumReady) {
    label = t("עיצוב האלבום של {title} הועלה, לשליחה ללקוח", { title: albumReady.title });
    href = albumReady.href;
  } else if (troubled) {
    label = t("חלק מהקבצים לא הועלו, לפרטים");
    href = troubled.href;
  } else {
    label = onlyPhotos(visible) ? t("העלאת התמונות הסתיימה") : t("ההעלאה הסתיימה");
    href = visible.every((u) => u.kind === "photos" || u.kind === "videos") ? "/galleries" : visible[0].href;
  }

  return (
    <div className="fixed inset-x-0 z-[60] flex justify-center px-4 pointer-events-none" style={{ bottom: "calc(16px + env(safe-area-inset-bottom, 0px))" }}>
      <Link
        href={href}
        className="pointer-events-auto relative flex items-center gap-2.5 max-w-full overflow-hidden rounded-full ps-3.5 pe-4 py-2.5 bg-ink text-white shadow-sheet text-sm font-semibold"
        aria-live="polite"
      >
        {active.length > 0 ? (
          <span className="h-4 w-4 shrink-0 rounded-full border-2 border-white/30 border-t-white animate-spin" aria-hidden="true" />
        ) : albumReady ? (
          <svg viewBox="0 0 24 24" width={16} height={16} fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" />
          </svg>
        ) : troubled ? (
          <svg viewBox="0 0 24 24" width={16} height={16} fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 8v5M12 16.5v.5M10.3 3.9L2.4 18a2 2 0 0 0 1.7 3h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" width={16} height={16} fill="none" stroke="currentColor" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M20 6L9 17l-5-5" />
          </svg>
        )}
        <span className="truncate">{label}</span>
        {active.length > 0 && <span className="shrink-0 font-data opacity-70">{Math.round(pct)}%</span>}
        {active.length > 0 && <span className="absolute bottom-0 start-0 h-[3px] bg-white/60" style={{ width: `${pct}%` }} aria-hidden="true" />}
      </Link>
    </div>
  );
}
