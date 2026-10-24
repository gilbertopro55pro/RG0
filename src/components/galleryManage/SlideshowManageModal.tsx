"use client";

import { useT } from "@/i18n/client";
import { BTN_PRESS } from "@/lib/viewTransition";
import { resizedPhotoUrl } from "@/lib/galleryPhotoUrls";
import { PlayIcon } from "@/components/GalleryStyleIcons";

// "מצגת תמונות" in the gallery screen: which photos go into the client's slideshow. Moved out of
// GalleryManageView as it was (2026-10-23).
export function SlideshowManageModal({
  photos,
  selected,
  onToggle,
  onPreview,
  error,
  saving,
  onSave,
  onClose,
}: {
  photos: { id: string; url: string; previewUrl?: string | null }[];
  selected: Set<string>;
  onToggle: (id: string) => void;
  onPreview: () => void;
  error: string | null;
  saving: boolean;
  onSave: () => void;
  onClose: () => void;
}) {
  const t = useT();
  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      style={{ background: "rgba(28, 27, 25, 0.7)" }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-3xl p-5 bg-paper shadow-sheet max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-bold font-display mb-4">{t("מצגת תמונות")}</h2>
        <p className="text-xs text-ink-soft mb-3.5">
          {t("בוחרים אילו תמונות ייכנסו למצגת ללקוח, היא תוצג במסך מלא עם אפקטים רנדומליים.")}
        </p>

        <div className="flex items-center justify-between mb-2.5">
          <p className="text-xs text-ink-soft">{t("בחירת תמונות")}</p>
          {selected.size > 0 && (
            <button
              onClick={onPreview}
              aria-label={t("תצוגה מקדימה של המצגת")}
              title={t("תצוגה מקדימה")}
              className={`h-8 w-8 rounded-full flex items-center justify-center bg-amber-deep text-white ${BTN_PRESS}`}
            >
              <PlayIcon />
            </button>
          )}
        </div>
        <div className="grid grid-cols-4 gap-2 mb-2.5">
          {photos.map((p) => {
            const active = selected.has(p.id);
            return (
              <button
                key={p.id}
                onClick={() => onToggle(p.id)}
                className="relative aspect-square rounded-lg overflow-hidden"
                style={{
                  boxShadow: active
                    ? "0 0 0 2px var(--color-paper), 0 0 0 4px var(--color-amber-deep)"
                    : "0 0 0 1px var(--color-line)",
                }}
              >
                {/* A small thumbnail, never the original: 150+ full-size photos in this
                    grid ran an iPhone out of memory, and the page reloaded on the next tap. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={resizedPhotoUrl(p, 256)} alt="" loading="lazy" decoding="async" className="w-full h-full object-cover" />
                {active && (
                  <span
                    className="absolute top-0.5 right-0.5 h-4 w-4 rounded-full flex items-center justify-center text-[9px]"
                    style={{ background: "var(--color-amber-deep)", color: "var(--color-on-accent)" }}
                  >
                    ✓
                  </span>
                )}
              </button>
            );
          })}
        </div>
        <p className="text-[11px] text-ink-soft mb-5">{t("{n} תמונות נבחרו", { n: selected.size })}</p>

        {error && <p className="text-xs text-rose mb-2.5">{error}</p>}
        <div className="flex gap-2">
          <button
            onClick={onSave}
            disabled={saving}
            className="flex-1 rounded-lg py-3 text-sm font-semibold bg-ink text-white disabled:opacity-60"
          >
            {saving ? t("שומר...") : t("שמירה")}
          </button>
          <button
            onClick={onClose}
            className="flex-1 rounded-lg py-3 text-sm font-semibold bg-card border border-line text-ink-soft"
          >
            {t("ביטול")}
          </button>
        </div>
      </div>
    </div>
  );
}
