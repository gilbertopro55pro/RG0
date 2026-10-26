"use client";

import { useEffect, useRef, useState } from "react";
import { useT } from "@/i18n/client";
import { ProgressModal } from "@/components/ProgressModal";
import { buildExportReadyMessage } from "@/components/GalleryShareModal";
import { downloadBlob } from "@/lib/downloadBlob";
import { openWhatsApp } from "@/lib/waLink";
import {
  ALBUM_EXPORT_LABEL,
  cancelAlbumExport,
  dismissAlbumExport,
  freshDownloadUrl,
  isAlbumExportRunning,
  sendAlbumExportToBackground,
  showAlbumExport,
  useAlbumExports,
  useExportLineHosts,
  type AlbumExport,
} from "@/lib/albumExports";

// The album exports' screens, on every app screen (lib/albumExports.ts, owner 2026-10-22): the
// progress window with "המשך ברקע" and cancel, and the card when an export finishes or fails, with
// download and, from a gallery with a client phone, WhatsApp. An export the photographer watched
// to the end downloads by itself, as before; one sent to the background waits on its card, since
// a download that pops up in the middle of other work (or fails on iPhone without a tap) is worse.
// The background pill is AlbumExportPill, in the floating indicator's stack (UploadsIndicator).
// A print-house send (format "print") goes through the same screens; its card says where it was
// sent instead of offering a file, and closes by itself.
export default function AlbumExportsLayer() {
  const t = useT();
  const all = useAlbumExports();
  const front = all.find((e) => isAlbumExportRunning(e) && !e.background);
  const finished = all.filter((e) => !isAlbumExportRunning(e));

  return (
    <>
      {front && (
        <ProgressModal
          label={exportLabel(front, t)}
          pct={front.pct}
          onCancel={() => cancelAlbumExport(front.id)}
          onBackground={() => sendAlbumExportToBackground(front.id)}
        />
      )}
      {finished.length > 0 && (
        <div className="fixed inset-x-0 top-4 z-[120] flex flex-col items-center gap-2 px-4 pointer-events-none">
          {finished.map((e) => (
            <ExportCard key={e.id} task={e} />
          ))}
        </div>
      )}
    </>
  );
}

const PRINT_SENT_CARD_MS = 8000;

export function exportLabel(e: AlbumExport, t: ReturnType<typeof useT>): string {
  if (e.waitingForServer) return t("מכינים את השרת");
  const label = t(ALBUM_EXPORT_LABEL[e.format]);
  return e.alreadyActive ? t("{label} (כבר פעיל)", { label }) : label;
}

function ExportCard({ task }: { task: AlbumExport }) {
  const t = useT();
  const label = t(ALBUM_EXPORT_LABEL[task.format]);
  const [downloading, setDownloading] = useState(false);
  // The automatic download didn't go through (iPhone after a long export: the share sheet no
  // longer counts as the photographer's tap), so the card offers a plain link to the file.
  const [linkOnly, setLinkOnly] = useState(false);
  const autoStarted = useRef(false);

  const download = async () => {
    setDownloading(true);
    try {
      const url = await freshDownloadUrl(task);
      if (!url) throw new Error("no link");
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await downloadBlob(await res.blob(), task.filename, task.mimeType, task.allowSaveDialog);
    } catch {
      setLinkOnly(true);
    } finally {
      setDownloading(false);
    }
  };

  const print = task.format === "print";

  useEffect(() => {
    if (print || task.phase !== "ready" || task.background || autoStarted.current) return;
    autoStarted.current = true;
    // The export just finished in front of the photographer: download it, as before.
    void download();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [task.phase, task.background]);

  // A print-house send that went out: nothing to do with the card, so it goes after a few seconds.
  useEffect(() => {
    if (!print || task.phase !== "ready") return;
    const timer = setTimeout(() => dismissAlbumExport(task.id), PRINT_SENT_CARD_MS);
    return () => clearTimeout(timer);
  }, [print, task.phase, task.id]);

  const failed = task.phase === "failed";
  const where = task.galleryTitle ? t("של \"{title}\"", { title: task.galleryTitle }) : null;

  return (
    <div className="pointer-events-auto w-full max-w-md rounded-2xl p-4 bg-ink text-white shadow-sheet" role="status">
      <div className="flex items-center gap-3">
        <div
          className={`h-9 w-9 rounded-full flex items-center justify-center shrink-0 ${failed ? "bg-rose/20" : "bg-sage/20"}`}
          style={{ color: failed ? "var(--color-rose)" : "var(--color-sage)" }}
        >
          {failed ? (
            <svg viewBox="0 0 24 24" width={18} height={18} fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 8v5M12 16.5v.5M10.3 3.9L2.4 18a2 2 0 0 0 1.7 3h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" width={18} height={18} fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 6L9 17l-5-5" />
            </svg>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold">
            {print
              ? failed
                ? t("שליחה לבית הדפוס נכשלה")
                : t("נשלח לבית הדפוס")
              : failed
                ? t("{label} נכשל", { label })
                : t("{label} הושלם", { label })}
          </p>
          <p className="text-xs opacity-70 truncate">
            {print && !failed ? t("נשלח בהצלחה ל-{target}", { target: task.printTarget ?? "" }) : failed ? where : task.filename}
          </p>
        </div>
        <button onClick={() => dismissAlbumExport(task.id)} aria-label={t("סגירה")} className="shrink-0 text-white/60">
          <svg viewBox="0 0 24 24" width={14} height={14} fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </div>
      {failed ? (
        <p className="text-xs opacity-80 mt-2 leading-relaxed">{t(task.error ?? "שגיאה בייצוא הקבצים")}</p>
      ) : print ? null : (
        <>
          {linkOnly && <p className="text-xs opacity-70 mt-2">{t("ההורדה האוטומטית לא עבדה במכשיר הזה, אפשר להוריד בכפתור.")}</p>}
          <div className="flex items-center gap-2 mt-3">
            {linkOnly && task.downloadUrl ? (
              <a
                href={task.downloadUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 rounded-lg px-3.5 py-2 text-xs font-semibold bg-white text-ink text-center"
              >
                {t("הורדה")}
              </a>
            ) : (
              <button
                onClick={download}
                disabled={downloading}
                className="flex-1 rounded-lg px-3.5 py-2 text-xs font-semibold bg-white text-ink disabled:opacity-60"
              >
                {downloading ? t("מוריד...") : t("הורדה")}
              </button>
            )}
            {/* Straight to the client's WhatsApp chat, from a gallery with a client phone. */}
            {task.clientPhone && task.downloadUrl && (
              <button
                onClick={() => {
                  openWhatsApp(task.clientPhone!, buildExportReadyMessage({ label: ALBUM_EXPORT_LABEL[task.format], url: task.downloadUrl!, lang: task.clientLang }));
                  dismissAlbumExport(task.id);
                }}
                className="flex-1 rounded-lg px-3.5 py-2 text-xs font-semibold text-white"
                style={{ background: "#25D366" }}
              >
                {t("שיתוף בוואטסאפ")}
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// The export sent to the background, in the floating indicator's stack (UploadsIndicator). Tapping
// it brings the progress window back.
// Not while the gallery's own page shows the same export as a line (GalleryExportLine).
export function AlbumExportPill() {
  const t = useT();
  const task = useAlbumExports().find((e) => isAlbumExportRunning(e) && e.background);
  const lineHosts = useExportLineHosts();
  if (!task || lineHosts.includes(task.galleryId)) return null;
  const label = exportLabel(task, t);
  return (
    <button
      type="button"
      onClick={() => showAlbumExport(task.id)}
      className="pointer-events-auto relative flex items-center gap-2.5 max-w-full overflow-hidden rounded-full ps-3.5 pe-4 py-2.5 bg-ink text-white shadow-sheet text-sm font-semibold"
      aria-live="polite"
    >
      <span className="h-4 w-4 shrink-0 rounded-full border-2 border-white/30 border-t-white animate-spin" aria-hidden="true" />
      <span className="truncate">{task.galleryTitle ? t("{label} של \"{title}\"", { label, title: task.galleryTitle }) : label}</span>
      <span className="shrink-0 font-data opacity-70">{Math.floor(task.pct)}%</span>
      <span className="absolute bottom-0 start-0 h-[3px] bg-white/60" style={{ width: `${task.pct}%` }} aria-hidden="true" />
    </button>
  );
}
