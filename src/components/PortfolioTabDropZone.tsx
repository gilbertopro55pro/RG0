"use client";

import { useEffect, useRef, useState } from "react";
import { ALLOWED_ACCEPT } from "@/lib/imageUpload";
import { readDataTransferItems, type DroppedFile } from "@/lib/fileDrop";
import { droppedFromFileList, groupPortfolioFiles, portfolioImages, queuePortfolioUpload } from "@/lib/portfolioUploads";
import { isUploadActive, onUploadItem, useGalleryUploads } from "@/lib/galleryUploads";
import type { GalleryPhotoRow } from "@/lib/types";
import { useT } from "@/i18n/client";

const NEW_SUB = "__new__";

// One tab's drop zone in Settings › פורטפוליו › ניהול הפורטפוליו (owner, 2026-10-10): choose where
// the photos go — the tab itself, one of its sub-tabs, or a new sub-tab — then drag photos in or
// tap to pick them. A dragged folder becomes a sub-tab named after it, the way a folder dragged
// into a gallery becomes a gallery folder. The upload runs in the background engine.
export default function PortfolioTabDropZone({ photographerId, tab, subs }: { photographerId: string; tab: string; subs: string[] }) {
  const t = useT();
  const [target, setTarget] = useState("");
  const [newSub, setNewSub] = useState("");
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Photos that landed in this tab since the last drop here, and whether that drop was here.
  const [added, setAdded] = useState(0);
  const [queuedHere, setQueuedHere] = useState(false);
  const depth = useRef(0);
  const fileInput = useRef<HTMLInputElement>(null);
  const folderInput = useRef<HTMLInputElement>(null);

  const job = useGalleryUploads().find((u) => u.kind === "portfolio") ?? null;
  const active = isUploadActive(job);
  const jobKey = job?.key ?? null;

  useEffect(() => {
    if (!jobKey) return;
    return onUploadItem(jobKey, (value) => {
      if ((value as GalleryPhotoRow).portfolio_category === tab) setAdded((n) => n + 1);
    });
  }, [jobKey, tab]);

  // "נוספו N" stays a few seconds after the upload ends.
  useEffect(() => {
    if (active || added === 0) return;
    const timer = setTimeout(() => {
      setAdded(0);
      setQueuedHere(false);
    }, 6000);
    return () => clearTimeout(timer);
  }, [active, added]);

  const send = async (dropped: DroppedFile[]) => {
    const { images, rejected } = portfolioImages(dropped);
    const chosenSub = target === NEW_SUB ? newSub.trim() : target;
    if (target === NEW_SUB && !chosenSub && images.some((i) => !i.folder)) {
      setError(t("קודם נותנים שם לתת-הלשונית החדשה"));
      return;
    }
    setError(rejected > 0 ? t("{n} קבצים לא בפורמט נתמך", { n: rejected }) : null);
    if (images.length === 0) return;
    // A file inside a folder goes to the sub-tab named after that folder; a loose one where chosen.
    const groups = groupPortfolioFiles(images.map((i) => ({ file: i.file, category: tab, subcategory: i.folder ?? (chosenSub || null) })));
    const failed = await queuePortfolioUpload(photographerId, groups);
    if (failed) {
      setError(t(failed.error, { message: failed.message ?? "" }));
      return;
    }
    setAdded(0);
    setQueuedHere(true);
  };

  const hasFiles = (e: React.DragEvent) => Array.from(e.dataTransfer.types).includes("Files");
  const stop = (e: React.SyntheticEvent) => e.stopPropagation();

  return (
    <div className="order-last w-full sm:order-none sm:w-auto sm:flex-1 min-w-0">
      <div
        role="button"
        tabIndex={0}
        onClick={() => fileInput.current?.click()}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") fileInput.current?.click();
        }}
        onDragEnter={(e) => {
          if (!hasFiles(e)) return;
          e.preventDefault();
          depth.current++;
          setDragging(true);
        }}
        onDragOver={(e) => {
          if (hasFiles(e)) e.preventDefault();
        }}
        onDragLeave={(e) => {
          if (!hasFiles(e)) return;
          depth.current = Math.max(0, depth.current - 1);
          if (depth.current === 0) setDragging(false);
        }}
        onDrop={(e) => {
          if (!hasFiles(e)) return;
          e.preventDefault();
          depth.current = 0;
          setDragging(false);
          // Read synchronously: the drop's items are gone once this handler returns.
          void readDataTransferItems(e.dataTransfer.items).then(send);
        }}
        title={t("תיקייה שנגררת לכאן הופכת לתת-לשונית בשם שלה")}
        className={`flex items-center gap-2 rounded-lg border-2 border-dashed px-2 py-1.5 cursor-pointer transition-colors ${
          dragging ? "border-amber-deep bg-amber-bg" : "border-line bg-paper/60"
        }`}
      >
        <select
          value={target}
          onClick={stop}
          onChange={(e) => setTarget(e.target.value)}
          aria-label={t("לאן להעלות")}
          className="shrink-0 max-w-[45%] rounded-md border border-line bg-white px-1.5 py-1 text-xs"
        >
          <option value="">{t("ישירות ללשונית")}</option>
          {subs.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
          <option value={NEW_SUB}>{t("+ תת-לשונית חדשה...")}</option>
        </select>
        {target === NEW_SUB && (
          <input
            value={newSub}
            onClick={stop}
            onKeyDown={stop}
            onChange={(e) => setNewSub(e.target.value)}
            placeholder={t("שם תת-הלשונית")}
            autoFocus
            className="w-28 min-w-0 rounded-md border border-line bg-white px-1.5 py-1 text-xs"
          />
        )}
        <span className="flex-1 min-w-0 truncate text-xs text-ink-soft">{dragging ? t("שחררו כאן להעלאה") : t("גררו לכאן תמונות או תיקיות")}</span>
        <button
          type="button"
          onClick={(e) => {
            stop(e);
            folderInput.current?.click();
          }}
          className="shrink-0 text-[11px] font-semibold text-ink-soft underline"
        >
          {t("תיקייה")}
        </button>
      </div>
      {queuedHere && job && active ? (
        <div className="mt-1" aria-live="polite">
          <div className="flex items-center gap-1.5 text-[11px] font-semibold text-ink">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full border-2 border-line border-t-ink animate-spin" aria-hidden="true" />
            <span className="truncate">{t("מעלה {done} מתוך {total}", { done: job.done, total: job.total })}</span>
            <span className="ms-auto shrink-0 font-data text-ink-soft">{Math.round(job.pct)}%</span>
          </div>
          <div className="mt-1 h-1 rounded-full bg-line overflow-hidden">
            <div className="h-full rounded-full bg-ink transition-[width] duration-300" style={{ width: `${job.pct}%` }} />
          </div>
        </div>
      ) : queuedHere && added > 0 ? (
        <p className="mt-1 text-[11px] font-semibold text-sage">{t("{n} תמונות נוספו לפורטפוליו", { n: added })}</p>
      ) : null}
      {error && <p className="mt-1 text-[11px] text-rose">{error}</p>}
      <input
        ref={fileInput}
        type="file"
        accept={ALLOWED_ACCEPT}
        multiple
        hidden
        onChange={(e) => {
          if (e.target.files) void send(droppedFromFileList(e.target.files));
          e.target.value = "";
        }}
      />
      <input
        ref={folderInput}
        type="file"
        accept={ALLOWED_ACCEPT}
        multiple
        hidden
        onChange={(e) => {
          if (e.target.files) void send(droppedFromFileList(e.target.files));
          e.target.value = "";
        }}
        {...({ webkitdirectory: "true", directory: "true" } as unknown as Record<string, string>)}
      />
    </div>
  );
}
