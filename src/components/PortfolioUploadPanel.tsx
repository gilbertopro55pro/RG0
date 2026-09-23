"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { ALLOWED_ACCEPT, isAllowedImageFile, isHeicFile, convertHeicIfNeeded, putFileWithProgress } from "@/lib/imageUpload";
import type { GalleryPhotoRow } from "@/lib/types";
import { ProgressModal } from "@/components/ProgressModal";

// Sentinel for the dropdown's last option — picking it reveals a free-text input instead of
// picking one of the existing tabs. Never sent to the DB (see handleFiles' `trimmedCategory`).
const CUSTOM_CATEGORY = "__custom__";

// Lets a photographer add photos straight to the public portfolio, tagged to a chosen category
// ("tab"), without going through a client gallery at all. Photos still need a `gallery_id` (see
// gallery_photos' schema), so they land in one hidden, standalone gallery per photographer
// (`is_portfolio_only`) — created lazily on first use, excluded from the regular galleries list.
export default function PortfolioUploadPanel({ photographerId }: { photographerId: string }) {
  const supabase = createClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // "" means no tab (shows under "כללי"); CUSTOM_CATEGORY means the free-text input below is the
  // real source of truth instead — see trimmedCategory in handleFiles.
  const [category, setCategory] = useState("");
  const [customCategory, setCustomCategory] = useState("");
  const [categoryOptions, setCategoryOptions] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [progressText, setProgressText] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [doneCount, setDoneCount] = useState(0);
  // Same full-screen blocking ProgressModal the gallery uploader uses (GalleryManageView.tsx) — a
  // photographer shouldn't be able to wander off mid-upload and leave half a batch behind.
  const [uploadPct, setUploadPct] = useState(0);
  const cancelRequestedRef = useRef(false);

  // Closing/reloading the tab mid-upload silently drops the rest of the batch — ask first.
  useEffect(() => {
    if (!uploading) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [uploading]);

  // Loaded up front (not on-focus) — a <select> needs its options ready the moment it opens,
  // unlike the old text input + datalist combo this replaced.
  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("gallery_photos").select("portfolio_category").eq("photographer_id", photographerId).not("portfolio_category", "is", null);
      setCategoryOptions(Array.from(new Set((data ?? []).map((r) => r.portfolio_category as string).filter(Boolean))).sort((a, b) => a.localeCompare(b, "he")));
      // eslint-disable-next-line react-hooks/exhaustive-deps
    })();
  }, [photographerId]);

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
      setError(`שגיאה בבדיקת מאגר הפורטפוליו: ${lookupError.message}`);
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
      setError(createError?.message ?? "שגיאה ביצירת מאגר הפורטפוליו");
      return null;
    }
    return created.id;
  };

  const handleFiles = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    const files = Array.from(fileList).filter(isAllowedImageFile);
    const rejected = fileList.length - files.length;
    if (files.length === 0) {
      setError("לא נבחרו קבצי תמונה תקינים");
      return;
    }

    setUploading(true);
    setError(null);
    setDoneCount(0);
    setUploadPct(0);
    cancelRequestedRef.current = false;
    try {
      const galleryId = await getOrCreatePortfolioGallery();
      if (!galleryId) return;

      const trimmedCategory = (category === CUSTOM_CATEGORY ? customCategory : category).trim() || null;
      const failedFiles: string[] = [];
      let succeeded = 0;

      let cancelled = false;
      for (let i = 0; i < files.length; i++) {
        if (cancelRequestedRef.current) {
          cancelled = true;
          break;
        }
        let file = files[i];
        setProgressText(`מעלה ${i + 1} מתוך ${files.length}...`);
        setUploadPct((i / files.length) * 100);
        try {
          if (isHeicFile(file)) {
            try {
              file = await convertHeicIfNeeded(file);
            } catch (e) {
              failedFiles.push(`${file.name} (המרה נכשלה${e instanceof Error ? `: ${e.message}` : ""})`);
              continue;
            }
          }
          const path = `${photographerId}/${galleryId}/${crypto.randomUUID()}-${file.name}`;
          const contentType = file.type || "application/octet-stream";

          // A transient network blip mid-batch used to fail that one file outright with no
          // retry (unlike the regular gallery uploader, GalleryManageView.tsx, which already
          // retries 3x) — same fix here: one bad moment on a real connection shouldn't force a
          // manual re-upload of just that photo.
          let uploaded = false;
          let lastFailureReason = "שגיאה לא ידועה";
          for (let attempt = 0; attempt < 3 && !uploaded; attempt++) {
            if (attempt > 0) await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
            try {
              const urlRes = await fetch("/api/storage/upload-url", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ bucket: "galleries", path, contentType }),
              });
              const urlData = await urlRes.json();
              if (!urlRes.ok || !urlData.url) {
                lastFailureReason = urlData.error ?? "שגיאה";
                continue;
              }
              await putFileWithProgress(urlData.url, file, contentType, (fraction) => setUploadPct(((i + fraction) / files.length) * 100));
              uploaded = true;
            } catch (e) {
              lastFailureReason = e instanceof Error ? e.message : "שגיאת רשת";
            }
          }
          if (!uploaded) {
            failedFiles.push(`${file.name} (${lastFailureReason})`);
            continue;
          }
          const { data: photoRow, error: insertError } = await supabase
            .from("gallery_photos")
            .insert({
              gallery_id: galleryId,
              photographer_id: photographerId,
              storage_path: path,
              original_filename: file.name,
              file_size_bytes: file.size,
              sort_order: i,
              in_portfolio: true,
              portfolio_category: trimmedCategory,
            })
            .select()
            .single<GalleryPhotoRow>();
          if (insertError || !photoRow) {
            failedFiles.push(`${file.name} (${insertError?.message ?? "שגיאה בשמירה"})`);
            continue;
          }
          succeeded++;
          setDoneCount(succeeded);
          fetch(`/api/galleries/${galleryId}/photos/${photoRow.id}/preview`, { redirect: "manual" }).catch((e) =>
            console.error("preview warm-up failed", photoRow.id, e)
          );
        } catch (e) {
          failedFiles.push(`${file.name} (${e instanceof Error ? e.message : "שגיאה לא צפויה"})`);
        }
      }

      if (cancelled) {
        setError(`ההעלאה בוטלה: ${succeeded} מתוך ${files.length} תמונות הועלו לפני הביטול`);
      } else if (failedFiles.length > 0) {
        setError(`${failedFiles.length} קבצים לא הועלו: ${failedFiles.slice(0, 6).join(", ")}${failedFiles.length > 6 ? " ועוד..." : ""}`);
      }
      if (rejected > 0) {
        setError((prev) => (prev ? `${prev}, ${rejected} קבצים לא בפורמט נתמך` : `${rejected} קבצים לא בפורמט נתמך`));
      }
    } finally {
      setUploading(false);
      setProgressText(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  return (
    <div className="mt-3.5 pt-3.5 border-t border-line">
      <p className="text-sm font-semibold mb-1">העלאת תמונות ישירות לפורטפוליו</p>
      <p className="text-xs text-ink-soft mb-3">אפשר להעלות תמונות ישר לתיק העבודות, בלי לעבור דרך גלריה של לקוח/ה.</p>

      <label className="text-xs block mb-1 text-ink-soft">לשונית (נושא) להעלאה</label>
      <select
        value={category}
        onChange={(e) => setCategory(e.target.value)}
        disabled={uploading}
        className={`w-full rounded-lg px-3 py-2 text-sm border border-line bg-white ${category === CUSTOM_CATEGORY ? "mb-2" : "mb-3"}`}
      >
        <option value="">כללי (ללא נושא)</option>
        {categoryOptions.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
        <option value={CUSTOM_CATEGORY}>+ לשונית חדשה...</option>
      </select>
      {category === CUSTOM_CATEGORY && (
        <input
          value={customCategory}
          onChange={(e) => setCustomCategory(e.target.value)}
          placeholder="שם הלשונית החדשה, לדוגמה: חתונות"
          disabled={uploading}
          autoFocus
          className="w-full rounded-lg px-3 py-2 text-sm border border-line bg-white mb-3"
        />
      )}

      {uploading && <ProgressModal label="העלאת תמונות" pct={uploadPct} onCancel={() => (cancelRequestedRef.current = true)} />}
      {error && <p className="text-xs text-rose mb-2 whitespace-pre-line">{error}</p>}
      {progressText && <p className="text-xs text-ink-soft mb-2">{progressText}</p>}
      {!uploading && doneCount > 0 && <p className="text-xs text-sage mb-2">{doneCount} תמונות נוספו לפורטפוליו</p>}

      <input ref={fileInputRef} type="file" accept={ALLOWED_ACCEPT} multiple hidden onChange={(e) => handleFiles(e.target.files)} />
      <button
        onClick={() => fileInputRef.current?.click()}
        disabled={uploading}
        className="rounded-lg px-4 py-2.5 text-sm font-semibold bg-ink text-white disabled:opacity-60"
      >
        {uploading ? "מעלה..." : "בחירת תמונות והעלאה"}
      </button>
    </div>
  );
}
