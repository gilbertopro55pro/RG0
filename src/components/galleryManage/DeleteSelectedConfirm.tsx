"use client";

import { useT } from "@/i18n/client";
import { CLOSE_ANIMATION_MS } from "@/components/galleryManage/constants";

// "למחוק N תמונות?": the bottom sheet before the selected photos are deleted for good, fading out as
// it closes. Moved out of GalleryManageView as it was.
export default function DeleteSelectedConfirm({
  count,
  closing,
  onConfirm,
  onCancel,
}: {
  count: number;
  closing: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const t = useT();
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center"
      style={{
        background: "rgba(28, 27, 25, 0.45)",
        opacity: closing ? 0 : 1,
        transition: `opacity ${CLOSE_ANIMATION_MS}ms ease`,
      }}
      onClick={onCancel}
    >
      <div
        className="w-full max-w-md rounded-t-3xl p-5 pb-8 bg-paper shadow-sheet"
        style={{ opacity: closing ? 0 : 1, transition: `opacity ${CLOSE_ANIMATION_MS}ms ease` }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-bold mb-2 font-display">{t("למחוק {n} תמונות?", { n: count })}</h2>
        <p className="text-sm text-ink-soft mb-5">{t("הפעולה תמחק את התמונות שנבחרו לצמיתות מהגלריה ולא ניתן יהיה לשחזר אותן.")}</p>
        <div className="flex gap-2">
          <button onClick={onConfirm} className="flex-1 rounded-lg py-3 text-sm font-semibold bg-rose text-white">
            {t("כן, מחק לצמיתות")}
          </button>
          <button onClick={onCancel} className="flex-1 rounded-lg py-3 text-sm font-semibold bg-white border border-line text-ink-soft">
            {t("ביטול")}
          </button>
        </div>
      </div>
    </div>
  );
}
