"use client";

import type { GalleryFolderRow } from "@/lib/types";
import { useT } from "@/i18n/client";

// Confirms deleting a gallery tab (folder). Its photos stay in the gallery and move to "הכל".
export function DeleteFolderConfirmModal({
  deleteFolderConfirm,
  deletingFolder,
  deleteFolder,
  setDeleteFolderConfirm,
}: {
  deleteFolderConfirm: GalleryFolderRow;
  deletingFolder: boolean;
  deleteFolder: () => void;
  setDeleteFolderConfirm: (v: GalleryFolderRow | null) => void;
}) {
  const t = useT();
  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center p-4"
      style={{ background: "rgba(28, 27, 25, 0.7)" }}
      onClick={() => !deletingFolder && setDeleteFolderConfirm(null)}
    >
      <div className="w-full max-w-md rounded-3xl p-5 bg-paper shadow-sheet" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-bold mb-2 font-display">{t("למחוק את הלשונית \"{name}\"?", { name: deleteFolderConfirm.name })}</h2>
        <p className="text-sm text-ink-soft mb-5">
          {t("התמונות שבתוכה לא יימחקו, הן פשוט יעברו ל\"הכל\". הלשונית עצמה תימחק לצמיתות ולא ניתן לשחזר אותה.")}
        </p>
        <div className="flex gap-2">
          <button
            onClick={deleteFolder}
            disabled={deletingFolder}
            className="flex-1 rounded-lg py-3 text-sm font-semibold bg-rose text-white disabled:opacity-60"
          >
            {deletingFolder ? t("מוחק...") : t("כן, מחק את הלשונית")}
          </button>
          <button
            onClick={() => setDeleteFolderConfirm(null)}
            disabled={deletingFolder}
            className="flex-1 rounded-lg py-3 text-sm font-semibold bg-white border border-line text-ink-soft disabled:opacity-60"
          >
            {t("ביטול")}
          </button>
        </div>
      </div>
    </div>
  );
}
