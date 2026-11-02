"use client";

import { useState } from "react";
import { useT } from "@/i18n/client";
import { BTN_PRESS } from "@/lib/viewTransition";
import { resizedPhotoUrl } from "@/lib/galleryPhotoUrls";
import { PlayIcon } from "@/components/GalleryStyleIcons";
import { IconClose } from "@/components/icons/AlbumIcons";

// "מצגת תמונות" in the gallery screen: which photos go into the client's slideshow. Moved out of
// GalleryManageView as it was (2026-10-23).
//
// `roomy` (owner, 2026-11-02, admin for now): "כל התמונות" / "מועדפים" above the grid, to pick from
// the client's favorites; and on a computer the window takes 80% of the screen's width, with bigger
// photos shown whole (not cropped to a square).
export function SlideshowManageModal({
  photos,
  selected,
  onToggle,
  onPreview,
  error,
  saving,
  onSave,
  onClose,
  roomy = false,
  onSelectMany,
}: {
  photos: { id: string; url: string; previewUrl?: string | null; is_favorite?: boolean }[];
  selected: Set<string>;
  onToggle: (id: string) => void;
  onPreview: () => void;
  error: string | null;
  saving: boolean;
  onSave: () => void;
  onClose: () => void;
  roomy?: boolean;
  // Selects (or clears) every photo shown: all the favorites at once, for a slideshow of them.
  onSelectMany?: (ids: string[], on: boolean) => void;
}) {
  const t = useT();
  const favorites = roomy ? photos.filter((p) => p.is_favorite) : [];
  const [source, setSource] = useState<"all" | "favorites">("all");
  const shown = roomy && source === "favorites" ? favorites : photos;
  const allShownSelected = shown.length > 0 && shown.every((p) => selected.has(p.id));
  const sourceBtn = (active: boolean) =>
    `flex-1 rounded-lg py-2 text-xs font-semibold border ${active ? "bg-ink text-white border-ink" : "bg-white text-ink border-line"}`;
  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      style={{ background: "rgba(28, 27, 25, 0.7)" }}
      onClick={onClose}
    >
      <div
        className={`w-full max-w-sm rounded-3xl p-5 bg-paper shadow-sheet max-h-[85vh] overflow-y-auto ${roomy ? "lg:max-w-none lg:w-[80vw] lg:p-6" : ""}`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* The title stays on top while the photos scroll, with an X in the top-right corner (owner,
            2026-11-02): the only way out was "ביטול", under all the photos. */}
        <div className={`sticky top-0 z-10 -mx-5 -mt-5 px-5 pt-5 pb-3 mb-1 bg-paper rounded-t-3xl ${roomy ? "lg:-mx-6 lg:-mt-6 lg:px-6 lg:pt-6" : ""}`}>
          <h2 className="text-lg font-bold font-display pr-11">{t("מצגת תמונות")}</h2>
          <button
            onClick={onClose}
            aria-label={t("סגירה")}
            className={`absolute top-4 right-4 h-9 w-9 rounded-full flex items-center justify-center bg-white border border-line text-ink ${roomy ? "lg:top-5 lg:right-5" : ""}`}
          >
            <IconClose className="h-4 w-4" />
          </button>
        </div>
        <p className="text-xs text-ink-soft mb-3.5">
          {t("בוחרים אילו תמונות ייכנסו למצגת ללקוח, היא תוצג במסך מלא עם אפקטים רנדומליים.")}
        </p>

        {roomy && (
          <div className="flex gap-2 mb-3 lg:max-w-sm">
            <button onClick={() => setSource("all")} aria-pressed={source === "all"} className={sourceBtn(source === "all")}>
              {t("כל התמונות ({n})", { n: photos.length })}
            </button>
            <button onClick={() => setSource("favorites")} aria-pressed={source === "favorites"} className={sourceBtn(source === "favorites")}>
              {t("מועדפים ({n})", { n: favorites.length })}
            </button>
          </div>
        )}
        <div className="flex items-center justify-between mb-2.5">
          <p className="text-xs text-ink-soft">
            {t("בחירת תמונות")}
            {roomy && onSelectMany && shown.length > 0 && (
              <>
                {" · "}
                <button onClick={() => onSelectMany(shown.map((p) => p.id), !allShownSelected)} className="font-semibold underline text-ink">
                  {allShownSelected ? t("ביטול הבחירה") : t("בחירת הכל")}
                </button>
              </>
            )}
          </p>
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
        {roomy && source === "favorites" && favorites.length === 0 && (
          <p className="text-xs text-ink-soft rounded-lg px-3 py-2.5 mb-2.5 bg-chip">{t("הלקוח עדיין לא סימן תמונות מועדפות.")}</p>
        )}
        <div className={`grid grid-cols-4 gap-2 mb-2.5 ${roomy ? "lg:grid-cols-[repeat(auto-fill,minmax(170px,1fr))] lg:gap-3" : ""}`}>
          {shown.map((p) => {
            const active = selected.has(p.id);
            return (
              <button
                key={p.id}
                onClick={() => onToggle(p.id)}
                className={`relative aspect-square rounded-lg overflow-hidden ${roomy ? "lg:bg-chip" : ""}`}
                style={{
                  boxShadow: active
                    ? "0 0 0 2px var(--color-paper), 0 0 0 4px var(--color-amber-deep)"
                    : "0 0 0 1px var(--color-line)",
                }}
              >
                {/* A small thumbnail, never the original: 150+ full-size photos in this
                    grid ran an iPhone out of memory, and the page reloaded on the next tap. */}
                {/* Roomy on a computer: a bigger file, and the whole photo in its square. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={resizedPhotoUrl(p, 256)}
                  srcSet={roomy ? `${resizedPhotoUrl(p, 256)} 256w, ${resizedPhotoUrl(p, 512)} 512w` : undefined}
                  sizes={roomy ? "(min-width: 1024px) 240px, 25vw" : undefined}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  className={`w-full h-full object-cover ${roomy ? "lg:object-contain" : ""}`}
                />
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
