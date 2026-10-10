"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { ALLOWED_ACCEPT } from "@/lib/imageUpload";
import { cancelUpload, dismissUpload, getUploadsSnapshot, isUploadActive, onUploadItem, subscribeUploads, useGalleryUploads } from "@/lib/galleryUploads";
import { readDataTransferItems, type DroppedFile } from "@/lib/fileDrop";
import { droppedFromFileList, groupPortfolioFiles, portfolioImages, queuePortfolioUpload } from "@/lib/portfolioUploads";
import type { GalleryPhotoRow } from "@/lib/types";
import { useT } from "@/i18n/client";

// Sentinel for the dropdown's last option — picking it reveals a free-text input instead of
// picking one of the existing tabs. Never sent to the DB (see `chosenTab`). Same for sub-tabs.
const CUSTOM_CATEGORY = "__custom__";
const CUSTOM_SUBCATEGORY = "__custom__";

const sortHe = (list: string[]) => list.sort((a, b) => a.localeCompare(b, "he"));
// The list with `value` added (sorted), or the same list when it's there already.
const withOption = (list: string[] | undefined, value: string) => (list?.includes(value) ? list : sortHe([...(list ?? []), value]));

// Lets a photographer add photos straight to the public portfolio, tagged to a chosen category
// ("tab"), without going through a client gallery at all. Photos still need a `gallery_id` (see
// gallery_photos' schema), so they land in one hidden, standalone gallery per photographer
// (`is_portfolio_only`) — created lazily on first use, excluded from the regular galleries list.
// The upload itself runs in the shared upload engine (lib/galleryUploads.ts, owner 2026-10-10):
// it keeps going while the photographer moves around the app, and picking more photos meanwhile
// joins it. Photos and folders can also be dragged in: like a gallery, a dragged folder becomes a
// tab named after it (lib/portfolioUploads.ts); loose photos go to the tab chosen above.
export default function PortfolioUploadPanel({ photographerId }: { photographerId: string }) {
  const supabase = createClient();
  const t = useT();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const dragDepth = useRef(0);

  // "" means no tab (shows under "כללי"); CUSTOM_CATEGORY means the free-text input below is the
  // real source of truth instead — see chosenTab below.
  const [category, setCategory] = useState("");
  const [customCategory, setCustomCategory] = useState("");
  const [categoryOptions, setCategoryOptions] = useState<string[]>([]);
  // Optional sub-tab inside the chosen tab, same "" / CUSTOM_SUBCATEGORY scheme. A sub-tab exists
  // only through the photos that carry it, so a tab's options are the distinct
  // portfolio_subcategory values among its photos.
  const [subcategory, setSubcategory] = useState("");
  const [customSubcategory, setCustomSubcategory] = useState("");
  const [subcategoryOptions, setSubcategoryOptions] = useState<Record<string, string[]>>({});
  const [error, setError] = useState<string | null>(null);
  // Photos the last finished upload added (the success line).
  const [addedCount, setAddedCount] = useState(0);

  // A photographer has exactly one portfolio gallery, so the portfolio upload is the only one of
  // its kind: coming back here mid-upload shows its progress.
  const job = useGalleryUploads().find((u) => u.kind === "portfolio") ?? null;
  const active = isUploadActive(job);
  const jobKey = job?.key ?? null;

  // Loaded up front (not on-focus) — a <select> needs its options ready the moment it opens,
  // unlike the old text input + datalist combo this replaced.
  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("gallery_photos").select("portfolio_category, portfolio_subcategory").eq("photographer_id", photographerId).not("portfolio_category", "is", null);
      const rows = (data ?? []) as Pick<GalleryPhotoRow, "portfolio_category" | "portfolio_subcategory">[];
      setCategoryOptions(sortHe(Array.from(new Set(rows.map((r) => r.portfolio_category as string).filter(Boolean)))));
      const subs: Record<string, string[]> = {};
      for (const r of rows) if (r.portfolio_category && r.portfolio_subcategory) subs[r.portfolio_category] = withOption(subs[r.portfolio_category], r.portfolio_subcategory);
      setSubcategoryOptions(subs);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    })();
  }, [photographerId]);

  // Listening while this panel is open makes the upload count as watched (no email or phone
  // notification when it ends here). A photo landing in a new tab (or sub-tab) adds it to the dropdown.
  useEffect(() => {
    if (!jobKey) return;
    return onUploadItem(jobKey, (value) => {
      const { portfolio_category: tab, portfolio_subcategory: sub } = value as GalleryPhotoRow;
      if (!tab) return;
      setCategoryOptions((prev) => withOption(prev, tab));
      if (sub) setSubcategoryOptions((prev) => (prev[tab]?.includes(sub) ? prev : { ...prev, [tab]: withOption(prev[tab], sub) }));
    });
  }, [jobKey]);

  // When the upload ends: how many made it, or what went wrong. Then it leaves the uploads list.
  const seenUploadPhaseRef = useRef<string | null>(null);
  useEffect(() => {
    // The engine words each failure as "<file> (<reason>)" with its reason in Hebrew; the reason
    // is one of the dictionary keys (galleries area), so it's shown in the photographer's language.
    const failedLabel = (s: string) => s.replace(/ \(([^()]*)\)$/, (_, reason: string) => ` (${t(reason)})`);
    const handle = () => {
      const u = getUploadsSnapshot().find((g) => g.kind === "portfolio") ?? null;
      if (!u) {
        seenUploadPhaseRef.current = null;
        return;
      }
      const prev = seenUploadPhaseRef.current;
      seenUploadPhaseRef.current = u.phase;
      if (u.phase === "queued" || u.phase === "uploading" || prev === u.phase) return;
      let message: string | null = null;
      if (u.phase === "offline") {
        message =
          u.succeeded > 0
            ? t("אין חיבור לאינטרנט, ההעלאה הופסקה. {done} מתוך {total} תמונות הספיקו לעלות לפני שהחיבור ירד. יש לבדוק את החיבור לרשת ולהעלות את השאר שוב.", { done: u.succeeded, total: u.total })
            : t("אין חיבור לאינטרנט, ההעלאה לא התחילה. יש לבדוק את החיבור לרשת ולנסות שוב.");
      } else if (u.phase === "cancelled") {
        message = t("ההעלאה בוטלה: {done} מתוך {n} תמונות הועלו לפני הביטול", { done: u.succeeded, n: u.total });
      } else if (u.failed.length > 0) {
        const files = u.failed.slice(0, 6).map(failedLabel).join(", ");
        message = t("{n} קבצים לא הועלו: {files}", { n: u.failed.length, files: `${files}${u.failed.length > 6 ? ` ${t("ועוד...")}` : ""}` });
      }
      if (u.phase === "done") setAddedCount(u.succeeded);
      // Added to what's shown already (e.g. the unsupported-format note from when the files were picked).
      if (message) setError((prevError) => (prevError ? `${prevError}\n${message}` : message));
      dismissUpload(u.key);
    };
    // Also an upload that ended while this panel was closed (checked once, right after opening).
    const first = setTimeout(handle, 0);
    const unsubscribe = subscribeUploads(handle);
    return () => {
      clearTimeout(first);
      unsubscribe();
    };
  }, [t]);

  // The tab the upload goes to ("" = none). A sub-tab needs one, so its control shows only then.
  const chosenTab = (category === CUSTOM_CATEGORY ? customCategory : category).trim();
  const tabSubOptions = subcategoryOptions[chosenTab] ?? [];
  // A picked sub-tab that the (retyped) new tab doesn't have falls back to none.
  const subValue = subcategory === CUSTOM_SUBCATEGORY || tabSubOptions.includes(subcategory) ? subcategory : "";

  // A photo inside a folder goes to the tab named after that folder; a loose one to the tab (and
  // sub-tab) chosen above.
  const send = async (dropped: DroppedFile[]) => {
    if (dropped.length === 0) return;
    const { images, rejected } = portfolioImages(dropped);
    setAddedCount(0);
    if (images.length === 0) {
      setError(t("לא נבחרו קבצי תמונה תקינים"));
      return;
    }
    setError(rejected > 0 ? t("{n} קבצים לא בפורמט נתמך", { n: rejected }) : null);
    const tab = chosenTab || null;
    const sub = tab ? (subValue === CUSTOM_SUBCATEGORY ? customSubcategory : subValue).trim() || null : null;
    const groups = groupPortfolioFiles(images.map((i) => (i.folder ? { file: i.file, category: i.folder, subcategory: null } : { file: i.file, category: tab, subcategory: sub })));
    const failed = await queuePortfolioUpload(photographerId, groups);
    if (failed) setError(t(failed.error, { message: failed.message ?? "" }));
  };

  const hasFiles = (e: React.DragEvent) => Array.from(e.dataTransfer.types).includes("Files");

  return (
    <div className="mt-3.5 pt-3.5 border-t border-line">
      <p className="text-sm font-semibold mb-1">{t("העלאת תמונות ישירות לפורטפוליו")}</p>
      <p className="text-xs text-ink-soft mb-3">{t("אפשר להעלות תמונות ישר לתיק העבודות, בלי לעבור דרך גלריה של לקוח/ה.")}</p>

      <label className="text-xs block mb-1 text-ink-soft">{t("לשונית (נושא) להעלאה")}</label>
      <select
        value={category}
        onChange={(e) => {
          setCategory(e.target.value);
          setSubcategory("");
          setCustomSubcategory("");
        }}
        className={`w-full rounded-lg px-3 py-2 text-sm border border-line bg-white ${category === CUSTOM_CATEGORY ? "mb-2" : "mb-3"}`}
      >
        <option value="">{t("כללי (ללא נושא)")}</option>
        {categoryOptions.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
        <option value={CUSTOM_CATEGORY}>{t("+ לשונית חדשה...")}</option>
      </select>
      {category === CUSTOM_CATEGORY && (
        <input
          value={customCategory}
          onChange={(e) => setCustomCategory(e.target.value)}
          placeholder={t("שם הלשונית החדשה, לדוגמה: חתונות")}
          autoFocus
          className="w-full rounded-lg px-3 py-2 text-sm border border-line bg-white mb-3"
        />
      )}
      {chosenTab && (
        <>
          <label className="text-xs block mb-1 text-ink-soft">{t("תת-לשונית (לא חובה)")}</label>
          <select
            value={subValue}
            onChange={(e) => setSubcategory(e.target.value)}
            className={`w-full rounded-lg px-3 py-2 text-sm border border-line bg-white ${subValue === CUSTOM_SUBCATEGORY ? "mb-2" : "mb-3"}`}
          >
            <option value="">{t("בלי תת-לשונית")}</option>
            {tabSubOptions.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
            <option value={CUSTOM_SUBCATEGORY}>{t("+ תת-לשונית חדשה...")}</option>
          </select>
          {subValue === CUSTOM_SUBCATEGORY && (
            <input
              value={customSubcategory}
              onChange={(e) => setCustomSubcategory(e.target.value)}
              placeholder={t("שם תת-הלשונית החדשה, לדוגמה: הכנות")}
              autoFocus
              className="w-full rounded-lg px-3 py-2 text-sm border border-line bg-white mb-3"
            />
          )}
        </>
      )}

      {job && active && (
        <div className="mb-3" aria-live="polite">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-ink">
            <span className="h-3 w-3 shrink-0 rounded-full border-2 border-line border-t-ink animate-spin" aria-hidden="true" />
            <span className="truncate">{t("מעלה {done} מתוך {total}", { done: job.done, total: job.total })}</span>
            <span className="ms-auto shrink-0 font-data text-ink-soft">{Math.round(job.pct)}%</span>
            <button onClick={() => cancelUpload(job.key)} className="shrink-0 text-rose underline">
              {t("ביטול")}
            </button>
          </div>
          <div className="mt-1 h-1 rounded-full bg-line overflow-hidden">
            <div className="h-full rounded-full bg-ink transition-[width] duration-300" style={{ width: `${job.pct}%` }} />
          </div>
          <p className="text-[11px] text-ink-soft mt-1.5">{t("אפשר להמשיך לעבוד במערכת בזמן ההעלאה, ונעדכן כשהיא תסתיים.")}</p>
        </div>
      )}
      {error && <p className="text-xs text-rose mb-2 whitespace-pre-line">{error}</p>}
      {!active && addedCount > 0 && <p className="text-xs text-sage mb-2">{t("{n} תמונות נוספו לפורטפוליו", { n: addedCount })}</p>}

      <input
        ref={fileInputRef}
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
        ref={folderInputRef}
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
      {/* Stays usable while uploading: more photos join the running upload. On a phone it's a tap-to-pick button. */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => fileInputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") fileInputRef.current?.click();
        }}
        onDragEnter={(e) => {
          if (!hasFiles(e)) return;
          e.preventDefault();
          dragDepth.current++;
          setDragging(true);
        }}
        onDragOver={(e) => {
          if (hasFiles(e)) e.preventDefault();
        }}
        onDragLeave={(e) => {
          if (!hasFiles(e)) return;
          dragDepth.current = Math.max(0, dragDepth.current - 1);
          if (dragDepth.current === 0) setDragging(false);
        }}
        onDrop={(e) => {
          if (!hasFiles(e)) return;
          e.preventDefault();
          dragDepth.current = 0;
          setDragging(false);
          // Read synchronously: the drop's items are gone once this handler returns.
          void readDataTransferItems(e.dataTransfer.items).then(send);
        }}
        className={`flex min-h-[96px] flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed px-4 py-5 text-center cursor-pointer transition-colors ${
          dragging ? "border-amber-deep bg-amber-bg" : "border-line bg-white"
        }`}
      >
        <span className="text-sm font-semibold">{dragging ? t("שחררו כאן להעלאה") : t("גררו לכאן תמונות או תיקיות, או לחצו לבחירה")}</span>
        <span className="text-[11px] text-ink-soft">{t("תיקייה שנגררת הופכת ללשונית בשם התיקייה. תמונות בודדות נכנסות ללשונית שבחרתם למעלה.")}</span>
      </div>
      <button type="button" onClick={() => folderInputRef.current?.click()} className="mt-2 text-xs font-semibold text-ink-soft underline">
        {t("העלאת תיקייה")}
      </button>
    </div>
  );
}
