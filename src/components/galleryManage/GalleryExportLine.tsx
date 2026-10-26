"use client";

import { useEffect, useRef, useState } from "react";
import { useT } from "@/i18n/client";
import { exportLabel } from "@/components/AlbumExportsLayer";
import { isAlbumExportRunning, showAlbumExport, useAlbumExports, useExportLineHost } from "@/lib/albumExports";

// The gallery's album export (PDF, JPG, PSD) or print-house send running in the background, as a
// progress line on the gallery's page (owner, 2026-10-26). Tapping it brings back the progress
// window, with cancel. While the line is in view, the floating pill for the same export steps
// aside (useExportLineHost); scrolled away, the pill is back. Hidden while the album tool covers
// the page (`visible`), where the pill shows instead.
export default function GalleryExportLine({ galleryId, visible }: { galleryId: string; visible: boolean }) {
  const t = useT();
  const task = useAlbumExports().find((e) => isAlbumExportRunning(e) && e.galleryId === galleryId);
  const shown = !!task && visible;
  const ref = useRef<HTMLButtonElement>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!shown || !el || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(([entry]) => setInView(entry.isIntersecting));
    observer.observe(el);
    return () => {
      observer.disconnect();
      setInView(false);
    };
  }, [shown]);
  useExportLineHost(shown && inView ? galleryId : null);
  if (!shown) return null;
  const pct = Math.min(100, Math.max(0, task.pct));
  return (
    <button
      ref={ref}
      type="button"
      onClick={() => showAlbumExport(task.id)}
      className="mb-3 block w-full rounded-xl bg-card px-3 py-2 text-start"
      aria-live="polite"
    >
      <div className="flex items-center gap-1.5 text-[11px] font-semibold text-ink">
        <span className="h-3 w-3 shrink-0 rounded-full border-2 border-line border-t-ink animate-spin" aria-hidden="true" />
        <span className="min-w-0 truncate">
          {exportLabel(task, t)}
          {task.format === "print" && task.printTarget && <span className="font-normal text-ink-soft"> · {task.printTarget}</span>}
        </span>
        <span className="ms-auto shrink-0 font-data text-ink-soft">{Math.floor(pct)}%</span>
        <span className="shrink-0 underline underline-offset-2">{t("הצגה")}</span>
      </div>
      <div className="mt-1 h-1 rounded-full bg-line overflow-hidden">
        <div className="h-full rounded-full bg-ink transition-[width] duration-300" style={{ width: `${pct}%` }} />
      </div>
    </button>
  );
}
