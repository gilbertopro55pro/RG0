"use client";

import { useState } from "react";
import type { GalleryFolderRow } from "@/lib/types";
import { useT } from "@/i18n/client";

export type DeleteFolderMode = "tab" | "photos";

// Confirms deleting a gallery tab (owner, 2026-10-28). With photos in it, the photographer picks
// one of two ways, each explained, and only then confirms: the tab alone (its photos stay in the
// gallery under "הכל"), or the tab and its photos. A main tab's sub-tabs go with it either way.
export function DeleteFolderConfirmModal({
  folder,
  subTabs,
  photoCount,
  deleting,
  onDelete,
  onCancel,
}: {
  folder: GalleryFolderRow;
  subTabs: number;
  photoCount: number;
  deleting: boolean;
  onDelete: (mode: DeleteFolderMode) => void;
  onCancel: () => void;
}) {
  const t = useT();
  const [mode, setMode] = useState<DeleteFolderMode | null>(null);
  const option = (value: DeleteFolderMode, title: string, text: string) => (
    <label
      className={`flex gap-3 rounded-xl border p-3 cursor-pointer ${mode === value ? (value === "photos" ? "border-rose bg-rose/5" : "border-ink bg-white") : "border-line bg-white"}`}
    >
      <input type="radio" name="delete-folder-mode" checked={mode === value} onChange={() => setMode(value)} className="mt-1 shrink-0" disabled={deleting} />
      <span>
        <span className="block text-sm font-semibold mb-0.5">{title}</span>
        <span className="block text-[13px] leading-snug text-ink-soft">{text}</span>
      </span>
    </label>
  );
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4" style={{ background: "rgba(28, 27, 25, 0.7)" }} onClick={() => !deleting && onCancel()}>
      <div className="w-full max-w-md rounded-3xl p-5 bg-paper shadow-sheet" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-bold mb-2 font-display">{t("למחוק את הלשונית \"{name}\"?", { name: folder.name })}</h2>
        {photoCount === 0 ? (
          <p className="text-sm text-ink-soft mb-5">
            {subTabs > 0
              ? t("אין בלשונית תמונות. הלשונית ו-{k} תת-הלשוניות שלה יימחקו.", { k: subTabs })
              : t("אין בלשונית תמונות. הלשונית תימחק.")}
          </p>
        ) : (
          <>
            <p className="text-sm text-ink-soft mb-3">{t("בלשונית יש {n} תמונות. מה למחוק?", { n: photoCount })}</p>
            <div className="space-y-2 mb-5">
              {option(
                "tab",
                t("רק את הלשונית"),
                subTabs > 0
                  ? t("הלשונית ו-{k} תת-הלשוניות שלה יימחקו. {n} התמונות יישארו בגלריה, ב\"הכל\", בלי לשונית. הלקוח ימשיך לראות אותן.", { k: subTabs, n: photoCount })
                  : t("הלשונית תימחק. {n} התמונות יישארו בגלריה, ב\"הכל\", בלי לשונית. הלקוח ימשיך לראות אותן.", { n: photoCount })
              )}
              {option(
                "photos",
                t("את הלשונית ואת התמונות"),
                subTabs > 0
                  ? t("הלשונית, תת-הלשוניות שלה ו-{n} התמונות יימחקו מהגלריה ומהאחסון. לא ניתן לשחזר אותן. תמונה שנמצאת באלבום או בפורטפוליו תימחק גם משם.", { n: photoCount })
                  : t("הלשונית ו-{n} התמונות יימחקו מהגלריה ומהאחסון. לא ניתן לשחזר אותן. תמונה שנמצאת באלבום או בפורטפוליו תימחק גם משם.", { n: photoCount })
              )}
            </div>
          </>
        )}
        <div className="flex gap-2">
          <button
            onClick={() => onDelete(photoCount === 0 ? "tab" : (mode as DeleteFolderMode))}
            disabled={deleting || (photoCount > 0 && !mode)}
            className="flex-1 rounded-lg py-3 text-sm font-semibold bg-rose text-white disabled:opacity-50"
          >
            {deleting ? t("מוחק...") : mode === "photos" ? t("מחיקת הלשונית ו-{n} תמונות", { n: photoCount }) : t("מחיקת הלשונית")}
          </button>
          <button onClick={onCancel} disabled={deleting} className="flex-1 rounded-lg py-3 text-sm font-semibold bg-white border border-line text-ink-soft disabled:opacity-60">
            {t("ביטול")}
          </button>
        </div>
      </div>
    </div>
  );
}
