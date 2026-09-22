"use client";

import { useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { ALLOWED_ACCEPT, isAllowedImageFile, isHeicFile, convertHeicIfNeeded } from "@/lib/imageUpload";
import type { GalleryPhotoRow } from "@/lib/types";

// Lets a photographer add photos straight to the public portfolio, tagged to a chosen category
// ("tab"), without going through a client gallery at all. Photos still need a `gallery_id` (see
// gallery_photos' schema), so they land in one hidden, standalone gallery per photographer
// (`is_portfolio_only`) — created lazily on first use, excluded from the regular galleries list.
export default function PortfolioUploadPanel({ photographerId }: { photographerId: string }) {
  const supabase = createClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [category, setCategory] = useState("");
  const [categoryOptions, setCategoryOptions] = useState<string[]>([]);
  const [loadedOptions, setLoadedOptions] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progressText, setProgressText] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [doneCount, setDoneCount] = useState(0);

  const loadCategoryOptions = async () => {
    if (loadedOptions) return;
    setLoadedOptions(true);
    const { data } = await supabase.from("gallery_photos").select("portfolio_category").eq("photographer_id", photographerId).not("portfolio_category", "is", null);
    setCategoryOptions(Array.from(new Set((data ?? []).map((r) => r.portfolio_category as string).filter(Boolean))));
  };

  const getOrCreatePortfolioGallery = async (): Promise<string | null> => {
    const { data: existing } = await supabase
      .from("galleries")
      .select("id")
      .eq("photographer_id", photographerId)
      .eq("is_portfolio_only", true)
      .maybeSingle<{ id: string }>();
    if (existing) return existing.id;

    const { data: created, error: createError } = await supabase
      .from("galleries")
      .insert({
        photographer_id: photographerId,
        event_id: null,
        title: "פורטפוליו — תמונות שהועלו ישירות",
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
    try {
      const galleryId = await getOrCreatePortfolioGallery();
      if (!galleryId) return;

      const trimmedCategory = category.trim() || null;
      const failedFiles: string[] = [];
      let succeeded = 0;

      for (let i = 0; i < files.length; i++) {
        let file = files[i];
        setProgressText(`מעלה ${i + 1} מתוך ${files.length}...`);
        try {
          if (isHeicFile(file)) {
            try {
              file = await convertHeicIfNeeded(file);
            } catch {
              failedFiles.push(`${file.name} (המרה נכשלה)`);
              continue;
            }
          }
          const path = `${photographerId}/${galleryId}/${crypto.randomUUID()}-${file.name}`;
          const urlRes = await fetch("/api/storage/upload-url", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ bucket: "galleries", path, contentType: file.type || "application/octet-stream" }),
          });
          const urlData = await urlRes.json();
          if (!urlRes.ok || !urlData.url) {
            failedFiles.push(`${file.name} (${urlData.error ?? "שגיאה"})`);
            continue;
          }
          const putRes = await fetch(urlData.url, { method: "PUT", headers: { "Content-Type": file.type || "application/octet-stream" }, body: file });
          if (!putRes.ok) {
            failedFiles.push(`${file.name} (סטטוס ${putRes.status})`);
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

      if (failedFiles.length > 0) {
        setError(`${failedFiles.length} קבצים לא הועלו: ${failedFiles.slice(0, 6).join(", ")}${failedFiles.length > 6 ? " ועוד..." : ""}`);
      }
      if (rejected > 0) {
        setError((prev) => (prev ? `${prev} · ${rejected} קבצים לא בפורמט נתמך` : `${rejected} קבצים לא בפורמט נתמך`));
      }
    } finally {
      setUploading(false);
      setProgressText(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  return (
    <div className="mt-3.5 pt-3.5 border-t border-line">
      <p className="text-sm font-semibold tracking-wide mb-1">העלאת תמונות ישירות לפורטפוליו</p>
      <p className="text-xs text-ink-soft mb-3">אפשר להעלות תמונות ישר לתיק העבודות, בלי לעבור דרך גלריה של לקוח/ה.</p>

      <label className="text-xs block mb-1 text-ink-soft">לשונית (נושא) להעלאה</label>
      <input
        value={category}
        onChange={(e) => setCategory(e.target.value)}
        onFocus={loadCategoryOptions}
        list="portfolio-upload-category-suggestions"
        placeholder="לדוגמה: חתונות"
        disabled={uploading}
        className="w-full rounded-lg px-3 py-2 text-sm border border-line bg-white mb-3"
      />
      <datalist id="portfolio-upload-category-suggestions">
        {categoryOptions.map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>

      {error && <p className="text-xs text-rose mb-2 whitespace-pre-line">{error}</p>}
      {progressText && <p className="text-xs text-ink-soft mb-2">{progressText}</p>}
      {!uploading && doneCount > 0 && <p className="text-xs text-sage mb-2">{doneCount} תמונות נוספו לפורטפוליו ✓</p>}

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
