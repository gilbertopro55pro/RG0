"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { PAGE_GUIDES, GUIDE_LANG_LABELS, type GuideLang, type PageGuideKey } from "@/lib/pageGuides";

// Sits right under a page's <h1>: a short two-line Hebrew explanation of what the screen is for,
// ending in a link that opens the full multi-language guide (video + written sections, with real
// in-app screenshots) in a modal. The blurb itself stays Hebrew-only, matching the rest of the
// app; only the full guide content (and its video narration) is translated (he/en/ru) — video path
// stays fixed to the Hebrew recording regardless of the selected language tab, since only Hebrew
// narration was produced.
const AUTOPLAY_SEEN_PREFIX = "guide-video-autoplay-";

export default function PageGuide({ pageKey, blurb }: { pageKey: PageGuideKey; blurb: string }) {
  const [open, setOpen] = useState(false);
  const [lang, setLang] = useState<GuideLang>("he");
  const guide = PAGE_GUIDES[pageKey][lang];
  const videoSrc = `/guides/${pageKey}.mp4`;

  // First time this specific page is ever opened by this browser, the guide (with its video)
  // opens on its own instead of waiting for the "מדריך למשתמש המלא" link to be clicked — closeable
  // like any other time, and never auto-opens again for this page once it has.
  useEffect(() => {
    const key = AUTOPLAY_SEEN_PREFIX + pageKey;
    try {
      if (!localStorage.getItem(key)) {
        localStorage.setItem(key, "1");
        setOpen(true);
      }
    } catch {}
  }, [pageKey]);

  return (
    <>
      <p className="text-xs mb-5 text-ink-soft leading-relaxed">
        {blurb}{" "}
        <button onClick={() => setOpen(true)} className="font-semibold underline" style={{ color: "var(--color-amber-deep)" }}>
          מדריך למשתמש המלא
        </button>
      </p>

      {open && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center p-4"
          style={{ background: "rgba(46,49,66,0.55)", backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)" }}
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
                ✕
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

            <div className="overflow-y-auto p-5 pt-4 space-y-5">
              <div className="rounded-xl overflow-hidden border border-line bg-black">
                {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
                <video src={videoSrc} controls autoPlay playsInline className="w-full h-auto block" />
              </div>
              {lang !== "he" && (
                <p className="text-xs text-ink-soft leading-relaxed -mt-2">
                  {lang === "ru" ? "Видео озвучено только на иврите." : "The video narration is only available in Hebrew."}
                </p>
              )}
              <p className="text-sm text-ink-soft leading-relaxed">{guide.intro}</p>
              {guide.sections.map((section, i) => (
                <div key={i}>
                  <h3 className="text-sm font-bold font-display mb-1.5">{section.heading}</h3>
                  <p className="text-sm text-ink-soft leading-relaxed mb-2.5">{section.body}</p>
                  {section.image && (
                    <div className="rounded-xl overflow-hidden border border-line">
                      <Image src={section.image} alt={section.heading} width={960} height={540} className="w-full h-auto" />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
