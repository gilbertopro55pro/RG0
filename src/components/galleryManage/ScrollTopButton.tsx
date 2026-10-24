"use client";

import { useT } from "@/i18n/client";
import { BTN_PRESS } from "@/lib/viewTransition";

// The round "back to the top" button at the corner of a long gallery. Moved out of GalleryManageView
// as it was.
export default function ScrollTopButton() {
  const t = useT();
  return (
    <button
      onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
      aria-label={t("חזרה לראש העמוד")}
      className={`fixed bottom-5 end-5 z-40 h-11 w-11 rounded-full flex items-center justify-center bg-ink text-white shadow-sheet ${BTN_PRESS}`}
    >
      <svg viewBox="0 0 24 24" width={18} height={18} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 19V5M5 12l7-7 7 7" />
      </svg>
    </button>
  );
}
