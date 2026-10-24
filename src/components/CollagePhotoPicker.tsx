"use client";

import { useEffect, useRef, useState } from "react";
import BodyPortal from "@/components/BodyPortal";
import { useT } from "@/i18n/client";

export type PickerPhoto = { id: string; src: string; blur: string | null };

// How many tiles are on the page at once, then this many more as the list scrolls near its end.
const PAGE = 24;

// Replacing one photo of the collage (admin, 2026-10-24, owner: "בלחיצה על התמונה ייפתח חלון עם
// התמונות לבחירה, בחירת תמונה רצויה ואישור"): a window over the collage with the photos at a medium
// size and whole (each tile has its photo's own shape, nothing cut), a tap selects, "אישור" swaps.
// The photos are the gallery's small previews from the CDN, a page at a time: the inline grid this
// replaces put up to 400 previews on the page at once, and a phone ran out of memory and reloaded.
// Square tiles in a grid (not columns), so the tiles added as the list scrolls never move the ones
// above; each photo sits whole in its tile, over a blurred copy of itself.
export default function CollagePhotoPicker({
  photos,
  currentSrc,
  fromAll,
  onToggleFromAll,
  onConfirm,
  onClose,
}: {
  photos: PickerPhoto[];
  // The photo being replaced, shown small in the header.
  currentSrc: string | null;
  fromAll: boolean;
  onToggleFromAll: () => void;
  onConfirm: (id: string) => void;
  onClose: () => void;
}) {
  const t = useT();
  const [selected, setSelected] = useState<string | null>(null);
  const [shown, setShown] = useState(PAGE);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // A new source starts at its top, with nothing selected (the list and its length change together).
  const [listKey, setListKey] = useState(fromAll);
  if (listKey !== fromAll) {
    setListKey(fromAll);
    setShown(PAGE);
    setSelected(null);
  }

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) setShown((n) => n + PAGE);
      },
      { root: scrollRef.current, rootMargin: "600px 0px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [shown, photos.length]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      onClose();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  const visible = photos.slice(0, shown);

  return (
    <BodyPortal>
      <div className="fixed inset-0 z-[120] flex items-end sm:items-center justify-center sm:p-4" style={{ background: "rgba(20, 18, 15, 0.7)" }} onClick={onClose}>
        <div
          role="dialog"
          aria-modal="true"
          className="flex w-full max-w-4xl flex-col overflow-hidden rounded-t-xl sm:rounded-md bg-paper shadow-sheet h-[92svh] sm:h-[86vh]"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center gap-3 border-b border-line px-4 py-3">
            {currentSrc && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={currentSrc} alt="" className="h-10 w-10 shrink-0 rounded-sm object-cover" />
            )}
            <div className="min-w-0 flex-1">
              <h3 className="font-display text-base font-semibold">{t("בחירת תמונה במקומה")}</h3>
              <p className="text-[11px] text-ink-soft">{t("בוחרים תמונה ולוחצים על אישור.")}</p>
            </div>
            <button
              onClick={onToggleFromAll}
              className={`shrink-0 px-3 py-1.5 rounded-md text-xs font-semibold border ${fromAll ? "bg-ink text-white border-ink" : "bg-white border-line text-ink"}`}
            >
              {t("מכל הגלריה")}
            </button>
            <button onClick={onClose} className="h-9 w-9 shrink-0 rounded-full border border-line bg-white text-ink-soft" aria-label={t("סגירה")}>
              ✕
            </button>
          </div>

          <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto p-2 sm:p-3">
            {photos.length === 0 ? (
              <p className="p-4 text-sm text-ink-soft">{t("אין עוד תמונות במקור הזה.")}</p>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                {visible.map((p) => {
                  const isSel = selected === p.id;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setSelected(p.id)}
                      onDoubleClick={() => onConfirm(p.id)}
                      aria-pressed={isSel}
                      className="relative block aspect-square w-full overflow-hidden bg-line"
                      style={{
                        outline: isSel ? "3px solid var(--color-amber-deep)" : "none",
                        outlineOffset: -3,
                        backgroundImage: p.blur ? `url(${p.blur})` : undefined,
                        backgroundSize: "cover",
                      }}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={p.src} alt="" loading="lazy" decoding="async" className="absolute inset-0 h-full w-full object-contain" />
                      {isSel && (
                        <span
                          className="absolute top-1.5 end-1.5 flex h-7 w-7 items-center justify-center rounded-full text-sm font-bold text-white shadow"
                          style={{ background: "var(--color-amber-deep)" }}
                          aria-hidden="true"
                        >
                          ✓
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
            {shown < photos.length && <div ref={sentinelRef} className="h-8" />}
          </div>

          <div className="flex items-center justify-end gap-2 border-t border-line px-4 py-3" style={{ paddingBottom: "max(12px, env(safe-area-inset-bottom))" }}>
            <button onClick={onClose} className="px-4 py-2 rounded-md border border-line bg-white text-sm font-semibold">
              {t("ביטול")}
            </button>
            <button
              onClick={() => selected && onConfirm(selected)}
              disabled={!selected}
              className="px-5 py-2 rounded-md bg-ink text-white text-sm font-semibold disabled:opacity-40"
            >
              {t("אישור")}
            </button>
          </div>
        </div>
      </div>
    </BodyPortal>
  );
}
