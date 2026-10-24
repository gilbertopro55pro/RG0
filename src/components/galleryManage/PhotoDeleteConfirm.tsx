"use client";

import { useT } from "@/i18n/client";

// "למחוק את התמונה?": the bottom sheet before one photo is deleted for good. Moved out of
// GalleryManageView as it was.
export default function PhotoDeleteConfirm({ onConfirm, onClose }: { onConfirm: () => void; onClose: () => void }) {
  const t = useT();
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" style={{ background: "rgba(28, 27, 25, 0.45)" }} onClick={onClose}>
      <div className="w-full max-w-md rounded-t-3xl p-5 pb-8 bg-paper shadow-sheet" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-bold mb-2 font-display">{t("למחוק את התמונה?")}</h2>
        <p className="text-sm text-ink-soft mb-5">{t("הפעולה תמחק את התמונה לצמיתות מהגלריה ולא ניתן יהיה לשחזר אותה.")}</p>
        <div className="flex gap-2">
          <button onClick={onConfirm} className="flex-1 rounded-lg py-3 text-sm font-semibold bg-rose text-white">
            {t("כן, מחק לצמיתות")}
          </button>
          <button onClick={onClose} className="flex-1 rounded-lg py-3 text-sm font-semibold bg-white border border-line text-ink-soft">
            {t("ביטול")}
          </button>
        </div>
      </div>
    </div>
  );
}
