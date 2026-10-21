"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useT } from "@/i18n/client";
import type { TFn } from "@/i18n/translate";
import type { GalleryAlbumRow, GalleryAlbumSpreadRow } from "@/lib/types";
import type { FaceRect } from "@/lib/albumAuto/swapPhotos";
import type { FaceCache } from "@/lib/albumAuto/swapFaces";
import { albumPhotoIds, checkAlbumQuality, issuesByPage, type QualityIssue, type QualityPhoto } from "@/lib/albumAuto/qualityCheck";

// The album's quality check in the album preview (admin, 2026-10-21): every problem that would
// show in print, page by page, with a jump to the page and a one-tap fix where one is safe (the
// rules in lib/albumAuto/qualityCheck.ts). Kept out of GalleryManageView, which only renders the
// panel, the badges on the page thumbnails and the highlight, and saves the fixes.

// How many photos have their faces found at once: the detector runs in the browser, on a phone too.
const DETECT_CONCURRENCY = 2;

type QualityPhotoRow = { id: string; preview_aspect_ratio: number | null; file_size_bytes: number | null };

export type AlbumQuality = ReturnType<typeof useAlbumQualityCheck>;

// The check's state: open or not, the problems (recomputed from the pages and the faces found so
// far on every change, so a fix, a swap or an editor save shows at once), and the face finding.
// The faces come from the same cache as the admin's swap (one search per photo for both):
// first the gallery's stored face detection, then the detector on each photo's small preview,
// two at a time and in page order, so the first pages are done first. The geometry problems
// (crops, empty frames, duplicates, text) show before any face is in.
export function useAlbumQualityCheck({
  album,
  spreads,
  photos,
  faceCache,
  loadStoredFaces,
}: {
  album: Pick<GalleryAlbumRow, "width_cm" | "height_cm" | "safe_margin_cm"> | null;
  spreads: GalleryAlbumSpreadRow[];
  photos: QualityPhotoRow[];
  faceCache: FaceCache;
  // Seeds faceCache with the gallery's stored detection for these photos.
  loadStoredFaces: (photoIds: string[]) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [faces, setFaces] = useState<ReadonlyMap<string, FaceRect[]>>(() => new Map());
  const [detection, setDetection] = useState<{ done: number; total: number } | null>(null);
  const [stopped, setStopped] = useState(false);
  const [failed, setFailed] = useState(0);
  const failedRef = useRef(new Set<string>());
  const loadRef = useRef(loadStoredFaces);
  useEffect(() => {
    loadRef.current = loadStoredFaces;
  });

  const photoIndex = useMemo(() => new Map<string, QualityPhoto>(photos.map((p) => [p.id, { aspect: p.preview_aspect_ratio, fileSizeBytes: p.file_size_bytes }])), [photos]);
  const idsKey = useMemo(() => albumPhotoIds(spreads).join(","), [spreads]);

  useEffect(() => {
    if (!open || stopped || !idsKey) return;
    let cancelled = false;
    const ids = idsKey.split(",");
    void (async () => {
      await loadRef.current(ids.filter((id) => !faceCache.known(id))).catch(() => {});
      if (cancelled) return;
      // Everything known so far: the stored detection, and faces the swap or an earlier run found.
      setFaces(new Map(ids.flatMap((id) => (faceCache.known(id) ? [[id, faceCache.known(id)!] as const] : []))));
      const queue = ids.filter((id) => !faceCache.known(id) && !failedRef.current.has(id));
      if (!queue.length) return setDetection(null);
      setDetection({ done: 0, total: queue.length });
      void import("@/lib/faceRecognition").then((m) => m.warmFaceBoxDetector()).catch(() => {});
      let next = 0;
      let done = 0;
      const worker = async () => {
        while (!cancelled && next < queue.length) {
          const id = queue[next++];
          const found = await faceCache.facesOf(id);
          if (!found) failedRef.current.add(id);
          done++;
          if (cancelled) return;
          setDetection({ done, total: queue.length });
          if (found) setFaces((prev) => new Map(prev).set(id, found));
          else setFailed(failedRef.current.size);
        }
      };
      await Promise.all(Array.from({ length: DETECT_CONCURRENCY }, worker));
      if (!cancelled) setDetection(null);
    })();
    return () => {
      cancelled = true;
    };
  }, [open, stopped, idsKey, faceCache]);

  const issuesFor = useCallback(
    (pages: GalleryAlbumSpreadRow[]) => (album ? checkAlbumQuality({ album, spreads: pages, photos: photoIndex, faces: (id) => faces.get(id) }) : []),
    [album, photoIndex, faces]
  );
  const issues = useMemo(() => (open ? issuesFor(spreads) : []), [open, issuesFor, spreads]);
  const byPage = useMemo(() => issuesByPage(issues), [issues]);

  return {
    open,
    issues,
    byPage,
    detection,
    stopped,
    failed,
    // The problems of these pages, with fixes computed on them (the saves use the latest pages).
    issuesFor,
    toggle: () => {
      setOpen((v) => !v);
      setStopped(false);
      setDetection(null);
    },
    stop: () => {
      setStopped(true);
      setDetection(null);
    },
    resume: () => setStopped(false),
  };
}

export function qualityIssueMessage(t: TFn, issue: QualityIssue): string {
  const p = issue.params;
  switch (issue.kind) {
    case "empty-frame":
      return p.missing ? t("התמונה במסגרת נמחקה מהגלריה") : t("מסגרת ריקה");
    case "head-cut":
      return issue.severity === "error" ? t("ראש חתוך בתמונה") : t("קצה הראש נחתך בתמונה");
    case "face-in-margin":
      return t("פרצוף בשוליים שנחתכים בהדפסה");
    case "face-on-fold":
      return t("פרצוף על הקיפול");
    case "heavy-crop":
      return t("חיתוך חזק ({crop})", { crop: p.crop });
    case "duplicate":
      return p.samePage ? t("אותה תמונה מופיעה פעמיים בעמוד הזה") : t("אותה תמונה מופיעה גם בעמוד {page}", { page: p.otherPage });
    case "text-outside-margin":
      return p.fold ? t("טקסט על הקיפול") : t("טקסט מחוץ לשוליים הבטוחים");
    case "small-file":
      return t("קובץ קטן לתמונה בגודל הזה ({kb} KB), עלולה לצאת לא חדה בהדפסה", { kb: p.kb });
  }
}

// The panel above the page thumbnails.
export default function AlbumQualityCheck({
  quality,
  onShow,
  onFix,
}: {
  quality: AlbumQuality;
  onShow: (issue: QualityIssue) => void;
  // Applies these problems' fixes (by id; the caller recomputes them on the latest pages).
  onFix: (issueIds: string[]) => void;
}) {
  const t = useT();
  const { issues, detection, stopped, failed } = quality;
  const pages = useMemo(() => {
    const out: { pageIndex: number; items: QualityIssue[] }[] = [];
    for (const issue of issues) {
      const last = out[out.length - 1];
      if (last?.pageIndex === issue.pageIndex) last.items.push(issue);
      else out.push({ pageIndex: issue.pageIndex, items: [issue] });
    }
    return out;
  }, [issues]);
  const fixable = issues.filter((i) => i.fix);
  const errors = issues.filter((i) => i.severity === "error").length;
  const summary =
    issues.length === 0
      ? t("לא נמצאו בעיות")
      : issues.length === 1
        ? t("נמצאה בעיה אחת")
        : pages.length === 1
          ? t("נמצאו {n} בעיות בעמוד אחד", { n: issues.length })
          : t("נמצאו {n} בעיות ב-{pages} עמודים", { n: issues.length, pages: pages.length });

  return (
    <section className="mb-3 rounded-xl border border-line bg-white p-3 text-ink min-w-0">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="min-w-0">
          <p className="text-sm font-bold">{summary}</p>
          {issues.length > 0 && (
            <p className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-ink-soft">
              {errors > 0 && (
                <span className="inline-flex items-center gap-1">
                  <span className="h-2 w-2 rounded-full bg-rose" aria-hidden="true" />
                  {t("שגיאות: {n}", { n: errors })}
                </span>
              )}
              {issues.length - errors > 0 && (
                <span className="inline-flex items-center gap-1">
                  <span className="h-2 w-2 rounded-full bg-amber-deep" aria-hidden="true" />
                  {t("אזהרות: {n}", { n: issues.length - errors })}
                </span>
              )}
            </p>
          )}
        </div>
        {fixable.length >= 2 && (
          <button
            type="button"
            onClick={() => onFix(fixable.map((i) => i.id))}
            className="min-h-9 rounded-full px-3 text-xs font-semibold bg-ink text-white"
          >
            {t("תיקון של כל מה שאפשר ({n})", { n: fixable.length })}
          </button>
        )}
      </div>
      <p className="mt-1 text-[11px] text-ink-soft">{t("הבדיקה מתעדכנת לבד אחרי כל תיקון, החלפה או עריכה.")}</p>

      {detection && (
        <div className="mt-2 flex items-center gap-2 flex-wrap">
          <div className="flex-1 min-w-[10rem]">
            <p className="text-[11px] text-ink">{t("מזהה פרצופים בתמונות: {done} מתוך {total}", { done: detection.done, total: detection.total })}</p>
            <div className="mt-1 h-1.5 rounded-full bg-line overflow-hidden">
              <div className="h-full bg-amber-deep transition-[width]" style={{ width: `${detection.total ? (detection.done / detection.total) * 100 : 0}%` }} />
            </div>
          </div>
          <button type="button" onClick={quality.stop} className="min-h-9 rounded-full px-3 text-xs font-semibold border border-line bg-white text-ink">
            {t("עצירת הזיהוי")}
          </button>
        </div>
      )}
      {stopped && (
        <div className="mt-2 flex items-center gap-2 flex-wrap rounded-lg bg-amber-bg px-3 py-2">
          <p className="flex-1 min-w-0 text-[11px] text-ink">{t("זיהוי הפרצופים נעצר, ולכן ראשים חתוכים ופרצופים על הקיפול נבדקו רק בחלק מהתמונות.")}</p>
          <button type="button" onClick={quality.resume} className="min-h-9 rounded-full px-3 text-xs font-semibold border border-line bg-white text-ink">
            {t("המשך הזיהוי")}
          </button>
        </div>
      )}
      {!detection && failed > 0 && <p className="mt-2 text-[11px] text-ink-soft">{t("לא ניתן היה לזהות פרצופים ב-{n} תמונות, ובהן לא נבדקו פרצופים.", { n: failed })}</p>}

      {pages.length > 0 && (
        <ul className="mt-2 max-h-[40vh] overflow-y-auto overscroll-contain divide-y divide-line">
          {pages.map(({ pageIndex, items }) => (
            <li key={pageIndex} className="py-1.5">
              <p className="text-[11px] font-bold text-ink-soft">{t("עמוד {n}", { n: pageIndex + 1 })}</p>
              {items.map((issue) => (
                <div key={issue.id} className="flex items-center gap-2 py-1 flex-wrap">
                  <span
                    className={`h-2.5 w-2.5 shrink-0 rounded-full ${issue.severity === "error" ? "bg-rose" : "bg-amber-deep"}`}
                    role="img"
                    aria-label={issue.severity === "error" ? t("שגיאה") : t("אזהרה")}
                  />
                  <span className="flex-1 min-w-[8rem] text-xs break-words">{qualityIssueMessage(t, issue)}</span>
                  <span className="flex gap-1.5 shrink-0">
                    <button type="button" onClick={() => onShow(issue)} className="min-h-9 rounded-full px-3 text-xs font-semibold border border-line bg-white text-ink">
                      {t("הצגה")}
                    </button>
                    {issue.fix && (
                      <button type="button" onClick={() => onFix([issue.id])} className="min-h-9 rounded-full px-3 text-xs font-semibold bg-ink text-white">
                        {t("תיקון")}
                      </button>
                    )}
                  </span>
                </div>
              ))}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// The count on a page thumbnail with problems: red with any error, amber with warnings only. A
// square with a "!" and a white ring, so on a phone's small thumbnails it doesn't read as the round
// page number in the other corner.
export function QualityPageBadge({ counts }: { counts: { errors: number; warnings: number } | undefined }) {
  if (!counts) return null;
  const n = counts.errors + counts.warnings;
  return (
    <span
      className={`absolute bottom-1 left-1 z-[2] h-4 px-1 rounded-md ring-1 ring-white text-white text-[9px] font-bold flex items-center gap-px pointer-events-none ${counts.errors ? "bg-rose" : "bg-amber-deep"}`}
    >
      <span aria-hidden="true">!</span>
      {n}
    </span>
  );
}

// The ring around the element a problem is about, over the page thumbnail ("הצגה").
// A frame that runs off the page is ringed where it shows.
export function QualityHighlight({ box }: { box: { xPct: number; yPct: number; widthPct: number; heightPct: number } }) {
  const x0 = Math.max(0, box.xPct);
  const y0 = Math.max(0, box.yPct);
  const x1 = Math.min(100, box.xPct + box.widthPct);
  const y1 = Math.min(100, box.yPct + box.heightPct);
  return (
    <span
      className="absolute z-[2] pointer-events-none rounded-sm ring-[3px] ring-inset ring-rose bg-rose/20 animate-pulse"
      style={{ left: `${x0}%`, top: `${y0}%`, width: `${Math.max(0, x1 - x0)}%`, height: `${Math.max(0, y1 - y0)}%` }}
    />
  );
}
