"use client";

import { useT } from "@/i18n/client";

// The bottom sheet a long press on a photo opens in the gallery manage screen: download, share, set
// as the cover, portfolio, delete. Moved out of GalleryManageView as it was.
export default function PhotoActionSheet({
  inPortfolio,
  onDownload,
  onShare,
  onSetCover,
  onTogglePortfolio,
  onDelete,
  onClose,
}: {
  inPortfolio: boolean;
  onDownload: () => void;
  onShare: () => void;
  onSetCover: () => void;
  onTogglePortfolio: () => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const t = useT();
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" style={{ background: "rgba(28, 27, 25, 0.45)" }} onClick={onClose}>
      <div className="w-full max-w-md rounded-t-3xl p-5 pb-8 bg-paper shadow-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="space-y-2">
          <button onClick={onDownload} className="w-full text-start rounded-lg py-3 px-4 text-sm font-medium bg-white border border-line">
            {t("הורדה")}
          </button>
          <button onClick={onShare} className="w-full text-start rounded-lg py-3 px-4 text-sm font-medium bg-white border border-line">
            {t("שיתוף")}
          </button>
          <button onClick={onSetCover} className="w-full text-start rounded-lg py-3 px-4 text-sm font-medium bg-white border border-line">
            {t("קביעה כשער לגלריה")}
          </button>
          <button onClick={onTogglePortfolio} className="w-full text-start rounded-lg py-3 px-4 text-sm font-medium bg-white border border-line">
            {inPortfolio ? t("הסרה מהפורטפוליו הציבורי") : t("הוספה לפורטפוליו הציבורי")}
          </button>
          <button onClick={onDelete} className="w-full text-start rounded-lg py-3 px-4 text-sm font-medium bg-white border border-line text-rose">
            {t("מחיקה")}
          </button>
          <button onClick={onClose} className="w-full text-center rounded-lg py-3 text-sm font-semibold text-ink-soft">
            {t("ביטול")}
          </button>
        </div>
      </div>
    </div>
  );
}
