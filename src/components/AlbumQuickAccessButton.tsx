"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { downloadBlob } from "@/lib/downloadBlob";
import { ProgressModal } from "@/components/ProgressModal";
import { pdfBandedPct } from "@/lib/pdfBandedPct";

type GalleryOption = { id: string; title: string; published: boolean; hasActiveAlbum: boolean };

type ExportFormat = "pdf" | "jpg" | "psd";

const FORMAT_LABEL: Record<ExportFormat, string> = { pdf: "PDF", jpg: "JPG", psd: "PSD" };
const FORMAT_ROUTE: Record<ExportFormat, string> = { pdf: "export-pdf", jpg: "export-jpg", psd: "export-psd" };
const FORMAT_MIME: Record<ExportFormat, string> = { pdf: "application/pdf", jpg: "application/zip", psd: "application/zip" };
const FORMAT_FILENAME: Record<ExportFormat, string> = { pdf: "album.pdf", jpg: "album-jpg.zip", psd: "album-psd.zip" };

// Dashboard shortcut into the album design tool without going through a specific gallery's own
// page first — picks a gallery from a dropdown (published or still draft, both valid — an album
// can be designed before the client-facing gallery ever goes live). Two destinations from there:
// "המשך" always deep-links into GalleryManageView with ?openAlbum=1 (auto-opens the album panel);
// when the selected gallery already HAS an album (hasActiveAlbum), three export buttons ALSO
// appear so the whole album (every page) can be exported right from this dialog, per explicit
// request — no navigation into the album tool at all for the common "just get me the file" case.
// Shares GalleryManageView's own ProgressModal (real spinner + progress ring, per explicit
// follow-up request — a plain disabled button with "מייצא..." text wasn't enough) and
// pdfBandedPct (so a PDF quality-step retry doesn't visibly reset to 0% here either).
// No "המשך ברקע" option (removed per explicit request — see ProgressModal's own onCancel-only
// usage below) and no WhatsApp share either — that richer completion toast is specific to
// GalleryManageView's own album tool, not part of this quick shortcut's deliberately minimal
// export flow. The modal stays open and blocking until the export finishes or is cancelled.
export default function AlbumQuickAccessButton({ galleries }: { galleries: GalleryOption[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [selectedId, setSelectedId] = useState(galleries[0]?.id ?? "");
  const [navigating, setNavigating] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  // Holds whichever job is currently being polled — a freshly created one, OR a pre-existing one
  // returned by findActiveExportJob (albumExportJobs.ts) when this gallery already has an export
  // running from somewhere else (the real album tool, another tab, or an earlier click here).
  // alreadyActive only changes the label text ("כבר פעיל" vs a plain export label); the actual
  // blocking behavior (full-screen modal, no other action reachable until cancel/done) is
  // identical either way — ProgressModal itself is what enforces "only cancelling lets a new
  // export start," not any separate guard in this component.
  const [currentJob, setCurrentJob] = useState<{ id: string; format: ExportFormat; alreadyActive: boolean } | null>(null);
  const [progressPct, setProgressPct] = useState(0);
  const cancelledRef = useRef(false);

  const go = () => {
    if (!selectedId) return;
    setNavigating(true);
    router.push(`/galleries/${selectedId}?openAlbum=1`);
  };

  const pollAndDownload = async (jobId: string, format: ExportFormat) => {
    let downloadUrl: string | null = null;
    let filename = FORMAT_FILENAME[format];
    // A single failed poll (a network blip, a cold-start hiccup) used to abort the whole thing
    // immediately, even for a PDF export that can legitimately take several minutes — one bad tick
    // in the middle of that shouldn't throw away everything already rendered server-side. Only
    // gives up after several IN A ROW fail, same tolerance spirit as the main upload flow's retry.
    let consecutiveFailures = 0;
    while (true) {
      if (cancelledRef.current) return;
      let res: Response;
      try {
        res = await fetch(`/api/galleries/${selectedId}/album/export-jobs/${jobId}`);
      } catch {
        consecutiveFailures++;
        if (consecutiveFailures >= 5) {
          setExportError("שגיאה בבדיקת התקדמות הייצוא — נסו לרענן את העמוד");
          return;
        }
        await new Promise((resolve) => setTimeout(resolve, 1500));
        continue;
      }
      if (!res.ok) {
        consecutiveFailures++;
        if (consecutiveFailures >= 5) {
          setExportError("שגיאה בבדיקת התקדמות הייצוא — נסו לרענן את העמוד");
          return;
        }
        await new Promise((resolve) => setTimeout(resolve, 1500));
        continue;
      }
      consecutiveFailures = 0;
      const data: {
        status: string;
        processedCount: number;
        totalCount: number;
        qualityStepIndex: number;
        errorMessage: string | null;
        downloadUrl: string | null;
        filename: string | null;
      } = await res.json();
      setProgressPct(
        format === "pdf"
          ? pdfBandedPct(data.qualityStepIndex, data.processedCount, data.totalCount)
          : data.totalCount > 0
            ? (data.processedCount / data.totalCount) * 100
            : 0
      );
      if (data.status === "ready") {
        downloadUrl = data.downloadUrl;
        if (data.filename) filename = data.filename;
        break;
      }
      if (data.status === "failed" || data.status === "cancelled") {
        if (data.status === "failed") setExportError(data.errorMessage ?? "שגיאה בייצוא הקבצים");
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 1500));
    }
    setProgressPct(100);
    if (cancelledRef.current || !downloadUrl) return;
    // The export job itself already succeeded by this point (status "ready") — a failure in just
    // this last step (fetching the file / triggering the browser download) is NOT the same as the
    // export having failed, and saying so was misleading: found live 2026-09-05, a report of
    // "שגיאה בייצוא הקבצים" that turned out to be a fully "ready" job in the DB, so whatever threw
    // was downstream of that. The export-ready EMAIL (sent server-side the moment the job finished,
    // independent of this) still has a working link regardless, which is why it's worth mentioning
    // here instead of just a bare error.
    try {
      const fileRes = await fetch(downloadUrl);
      const blob = await fileRes.blob();
      await downloadBlob(blob, filename, FORMAT_MIME[format]);
    } catch {
      setExportError("הייצוא הושלם בהצלחה אבל ההורדה נכשלה — קישור להורדה נשלח גם למייל שלך.");
    }
  };

  const quickExport = async (format: ExportFormat) => {
    if (!selectedId || currentJob) return;
    setExportError(null);
    cancelledRef.current = false;
    setProgressPct(0);
    try {
      // to: 9999 rather than a real page count (not available to this lightweight component) —
      // the create route clamps it down to the album's actual last page itself, so this reliably
      // means "the whole album" regardless of how many pages it actually has.
      const createRes = await fetch(`/api/galleries/${selectedId}/album/${FORMAT_ROUTE[format]}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ from: 1, to: 9999, quality: "web" }),
      });
      const createData: { jobId?: string; alreadyActive?: boolean; format?: ExportFormat; error?: string } = await createRes.json().catch(() => ({}));
      if (!createRes.ok || !createData.jobId) {
        setExportError(createData.error ?? "שגיאה בייצוא הקבצים");
        return;
      }
      const actualFormat = createData.format ?? format;
      setCurrentJob({ id: createData.jobId, format: actualFormat, alreadyActive: !!createData.alreadyActive });
      await pollAndDownload(createData.jobId, actualFormat);
    } catch {
      setExportError("שגיאה בייצוא הקבצים");
    } finally {
      setCurrentJob(null);
    }
  };

  const cancelCurrentJob = async () => {
    if (!currentJob || !selectedId) return;
    cancelledRef.current = true;
    try {
      await fetch(`/api/galleries/${selectedId}/album/export-jobs/${currentJob.id}`, { method: "DELETE", keepalive: true });
    } catch {
      // Best-effort — the poll loop already stopped locally (cancelledRef) regardless of whether
      // the server-side cancel request itself succeeds.
    } finally {
      setCurrentJob(null);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex-1 min-w-0 flex items-center justify-between gap-3 rounded-2xl p-4 bg-card border border-line shadow-card text-right"
      >
        <div className="flex items-center gap-3 min-w-0">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-lg bg-amber-bg">📖</span>
          <div className="min-w-0">
            <div className="text-sm font-semibold truncate">עיצוב אלבום</div>
            <div className="text-xs text-ink-soft truncate">גישה מהירה לפי גלריה</div>
          </div>
        </div>
        <span className="text-ink-soft shrink-0">←</span>
      </button>

      {currentJob && (
        <ProgressModal
          label={`ייצוא ${FORMAT_LABEL[currentJob.format]}${currentJob.alreadyActive ? " (כבר פעיל)" : ""}`}
          pct={progressPct}
          onCancel={cancelCurrentJob}
        />
      )}

      {open && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center p-4"
          style={{ background: "rgba(46,49,66,0.7)" }}
          onClick={() => !navigating && setOpen(false)}
        >
          <div className="w-full max-w-sm rounded-3xl bg-paper shadow-sheet p-5" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-bold font-display mb-1">עיצוב אלבום</h2>
            <p className="text-xs text-ink-soft mb-4">באיזו גלריה תרצו לעבוד?</p>

            {galleries.length === 0 ? (
              <p className="text-sm text-ink-soft mb-4">עדיין אין לך גלריות</p>
            ) : (
              <select
                value={selectedId}
                onChange={(e) => {
                  setSelectedId(e.target.value);
                  setExportError(null);
                }}
                className="w-full rounded-lg px-3 py-2.5 text-sm border border-line bg-white mb-4"
              >
                {galleries.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.title}
                    {!g.published ? " (טיוטה)" : ""}
                  </option>
                ))}
              </select>
            )}

            {galleries.find((g) => g.id === selectedId)?.hasActiveAlbum && (
              <div className="mb-4">
                <p className="text-xs font-semibold text-ink-soft mb-2">יש עיצוב אלבום פעיל בגלריה זו — אפשר לייצא ישירות:</p>
                <div className="flex items-center gap-2">
                  {(["pdf", "jpg", "psd"] as const).map((format) => (
                    <button
                      key={format}
                      type="button"
                      onClick={() => quickExport(format)}
                      className="flex-1 h-10 rounded-xl border border-line bg-white text-xs font-semibold"
                    >
                      {`ייצוא ${FORMAT_LABEL[format]}`}
                    </button>
                  ))}
                </div>
                {exportError && <p className="text-xs text-rose mt-2">{exportError}</p>}
              </div>
            )}

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setOpen(false)}
                disabled={navigating}
                className="flex-1 h-11 rounded-xl border border-line text-sm font-semibold disabled:opacity-50"
              >
                ביטול
              </button>
              <button
                type="button"
                onClick={go}
                disabled={!selectedId || navigating}
                className="flex-1 h-11 rounded-xl bg-ink text-white text-sm font-semibold disabled:opacity-50"
              >
                {navigating ? "טוען..." : "כניסה לכלי העיצוב"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
