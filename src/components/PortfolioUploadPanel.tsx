"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { ALLOWED_ACCEPT, isAllowedImageFile } from "@/lib/imageUpload";
import {
  cancelUpload,
  dismissUpload,
  enqueuePortfolioUpload,
  getUploadsSnapshot,
  isUploadActive,
  onUploadItem,
  otherTabUpload,
  subscribeUploads,
  useGalleryUploads,
} from "@/lib/galleryUploads";
import type { GalleryPhotoRow } from "@/lib/types";
import { useT } from "@/i18n/client";

// Sentinel for the dropdown's last option — picking it reveals a free-text input instead of
// picking one of the existing tabs. Never sent to the DB (see handleFiles' `trimmedCategory`).
const CUSTOM_CATEGORY = "__custom__";

// Lets a photographer add photos straight to the public portfolio, tagged to a chosen category
// ("tab"), without going through a client gallery at all. Photos still need a `gallery_id` (see
// gallery_photos' schema), so they land in one hidden, standalone gallery per photographer
// (`is_portfolio_only`) — created lazily on first use, excluded from the regular galleries list.
// The upload itself runs in the shared upload engine (lib/galleryUploads.ts, owner 2026-10-10):
// it keeps going while the photographer moves around the app, and picking more photos meanwhile
// joins it.
export default function PortfolioUploadPanel({ photographerId }: { photographerId: string }) {
  const supabase = createClient();
  const t = useT();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // "" means no tab (shows under "כללי"); CUSTOM_CATEGORY means the free-text input below is the
  // real source of truth instead — see trimmedCategory in handleFiles.
  const [category, setCategory] = useState("");
  const [customCategory, setCustomCategory] = useState("");
  const [categoryOptions, setCategoryOptions] = useState<string[]>([]);
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
      const { data } = await supabase.from("gallery_photos").select("portfolio_category").eq("photographer_id", photographerId).not("portfolio_category", "is", null);
      setCategoryOptions(Array.from(new Set((data ?? []).map((r) => r.portfolio_category as string).filter(Boolean))).sort((a, b) => a.localeCompare(b, "he")));
      // eslint-disable-next-line react-hooks/exhaustive-deps
    })();
  }, [photographerId]);

  // Listening while this panel is open makes the upload count as watched (no email or phone
  // notification when it ends here). A photo landing in a new tab adds that tab to the dropdown.
  useEffect(() => {
    if (!jobKey) return;
    return onUploadItem(jobKey, (value) => {
      const tab = (value as GalleryPhotoRow).portfolio_category;
      if (!tab) return;
      setCategoryOptions((prev) => (prev.includes(tab) ? prev : [...prev, tab].sort((a, b) => a.localeCompare(b, "he"))));
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

  const getOrCreatePortfolioGallery = async (): Promise<string | null> => {
    const { data: existing, error: lookupError } = await supabase
      .from("galleries")
      .select("id")
      .eq("photographer_id", photographerId)
      .eq("is_portfolio_only", true)
      .maybeSingle<{ id: string }>();
    // A real error here (not just "no row yet", which maybeSingle reports as no error at all)
    // used to be silently swallowed — falling through to try creating a gallery even though we
    // genuinely don't know if one already exists. Bail out instead so the real reason surfaces.
    if (lookupError) {
      setError(t("שגיאה בבדיקת מאגר הפורטפוליו: {message}", { message: lookupError.message }));
      return null;
    }
    if (existing) return existing.id;

    const { data: created, error: createError } = await supabase
      .from("galleries")
      .insert({
        photographer_id: photographerId,
        event_id: null,
        title: "פורטפוליו | תמונות שהועלו ישירות",
        is_portfolio_only: true,
        published: false,
        // Never actually used (this gallery is never published, so nothing here ever expires) —
        // just satisfies the DB's enforce_gallery_expiry_by_plan trigger, which rejects a null
        // expiry_days on every insert regardless of published state.
        expiry_days: 7,
      })
      .select("id")
      .single<{ id: string }>();
    if (createError || !created) {
      setError(createError?.message ?? t("שגיאה ביצירת מאגר הפורטפוליו"));
      return null;
    }
    return created.id;
  };

  const handleFiles = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    const files = Array.from(fileList).filter(isAllowedImageFile);
    const rejected = fileList.length - files.length;
    // Cleared so the same files can be picked again.
    if (fileInputRef.current) fileInputRef.current.value = "";
    setAddedCount(0);
    if (files.length === 0) {
      setError(t("לא נבחרו קבצי תמונה תקינים"));
      return;
    }
    // One tab uploads at a time (two would only split the connection between them).
    if (otherTabUpload()) {
      setError(t("כבר מתבצעת העלאה בחלון אחר. אפשר להעלות כאן כשהיא תסתיים."));
      return;
    }
    setError(rejected > 0 ? t("{n} קבצים לא בפורמט נתמך", { n: rejected }) : null);

    const galleryId = await getOrCreatePortfolioGallery();
    if (!galleryId) return;
    const trimmedCategory = (category === CUSTOM_CATEGORY ? customCategory : category).trim() || null;
    enqueuePortfolioUpload({ galleryId, userId: photographerId, category: trimmedCategory, files });
  };

  return (
    <div className="mt-3.5 pt-3.5 border-t border-line">
      <p className="text-sm font-semibold mb-1">{t("העלאת תמונות ישירות לפורטפוליו")}</p>
      <p className="text-xs text-ink-soft mb-3">{t("אפשר להעלות תמונות ישר לתיק העבודות, בלי לעבור דרך גלריה של לקוח/ה.")}</p>

      <label className="text-xs block mb-1 text-ink-soft">{t("לשונית (נושא) להעלאה")}</label>
      <select
        value={category}
        onChange={(e) => setCategory(e.target.value)}
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

      <input ref={fileInputRef} type="file" accept={ALLOWED_ACCEPT} multiple hidden onChange={(e) => handleFiles(e.target.files)} />
      {/* Stays usable while uploading: more photos join the running upload. */}
      <button onClick={() => fileInputRef.current?.click()} className="rounded-lg px-4 py-2.5 text-sm font-semibold bg-ink text-white">
        {t("בחירת תמונות והעלאה")}
      </button>
    </div>
  );
}
