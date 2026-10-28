"use client";

import { createPortal } from "react-dom";
import { useT } from "@/i18n/client";

// Phones render a blob: PDF fine in a new tab, so callers keep that path there. On desktop a
// blob: tab (from the installed PWA window especially) gets hijacked by PDF-viewer extensions
// such as Adobe Acrobat's, which can't read another origin's blob: URLs and show an endless
// spinner instead of the file — an <iframe> inside the page stays with the browser's own viewer.
export function isMobileOs(): boolean {
  return /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
}

export default function PdfPreviewModal({ url, title, onClose }: { url: string; title: string; onClose: () => void }) {
  const t = useT();
  // Portaled to <body> so a transformed/blurred ancestor sheet can't clip or offset the overlay.
  return createPortal(
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center p-4"
      style={{ background: "rgba(46,49,66,0.45)", backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)" }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-3xl h-full max-h-[90vh] rounded-3xl p-3 bg-paper shadow-sheet flex flex-col gap-2"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-1">
          <div className="text-sm font-semibold">{title}</div>
          <button onClick={onClose} className="rounded-lg px-3 py-1.5 text-sm font-semibold bg-white border border-line text-ink">
            {t("סגירה")}
          </button>
        </div>
        <iframe src={url} title={title} className="flex-1 w-full rounded-xl border border-line bg-white" />
      </div>
    </div>,
    document.body,
  );
}
