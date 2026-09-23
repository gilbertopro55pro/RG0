"use client";

import { useState } from "react";
import { PAGE_GUIDES, GUIDE_LANG_LABELS, type GuideLang, type PageGuideKey } from "@/lib/pageGuides";
import { IconClose } from "@/components/icons/AlbumIcons";

// A small "?" trigger next to a modal/dialog's own title, opening the same written multi-language
// guide content as PageGuide.tsx — but without its video (no recording exists for a modal tool like
// this) and without auto-opening on first visit (this sits inside a component that's already a
// modal; popping a second one open on its own would be intrusive rather than helpful).
export default function CompactGuideModal({ pageKey }: { pageKey: PageGuideKey }) {
  const [open, setOpen] = useState(false);
  const [lang, setLang] = useState<GuideLang>("he");
  const guide = PAGE_GUIDES[pageKey][lang];

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label="מדריך למשתמש"
        title="מדריך למשתמש"
        className="h-6 w-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
        style={{ background: "var(--color-amber-bg)", color: "var(--color-amber-deep)" }}
      >
        ?
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center p-4"
          style={{ background: "rgba(28, 27, 25, 0.55)", backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)" }}
          onClick={() => setOpen(false)}
        >
          <div
            dir={lang === "he" ? "rtl" : "ltr"}
            className="w-full max-w-lg rounded-3xl bg-paper shadow-sheet max-h-[85vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-5 pb-3 border-b border-line shrink-0">
              <h2 className="text-lg font-bold font-display">{guide.title}</h2>
              <button
                onClick={() => setOpen(false)}
                className="h-8 w-8 rounded-full flex items-center justify-center bg-white border border-line shrink-0"
                aria-label={lang === "he" ? "סגירה" : lang === "ru" ? "Закрыть" : "Close"}
              >
                <IconClose className="h-4 w-4" />
              </button>
            </div>

            <div className="flex gap-1.5 px-5 pt-3 shrink-0">
              {(Object.keys(GUIDE_LANG_LABELS) as GuideLang[]).map((l) => (
                <button
                  key={l}
                  onClick={() => setLang(l)}
                  className="rounded-full px-3 py-1 text-xs font-semibold"
                  style={{
                    background: lang === l ? "var(--color-amber-deep)" : "var(--color-chip)",
                    color: lang === l ? "#fff" : "var(--color-ink-soft)",
                  }}
                >
                  {GUIDE_LANG_LABELS[l]}
                </button>
              ))}
            </div>

            <div className="overflow-y-auto p-5 pt-4 space-y-4">
              <p className="text-sm text-ink-soft leading-relaxed">{guide.intro}</p>
              {guide.sections.map((section, i) => (
                <div key={i}>
                  <h3 className="text-sm font-bold font-display mb-1.5">{section.heading}</h3>
                  <p className="text-sm text-ink-soft leading-relaxed whitespace-pre-line">{section.body}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
