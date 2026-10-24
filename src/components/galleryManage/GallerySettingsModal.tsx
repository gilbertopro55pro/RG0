"use client";

import { useEffect, useState } from "react";
import { BTN_PRESS } from "@/lib/viewTransition";
import { resizedPhotoUrl } from "@/lib/galleryPhotoUrls";
import { IconClose as IconAlbumClose } from "@/components/icons/AlbumIcons";
import {
  GALLERY_THEMES,
  COVER_TEXT_POSITIONS,
  COVER_SHAPES,
  FONT_OPTIONS,
  GRID_STYLE_OPTIONS,
  galleryThemeById,
  galleryThemeVars,
  galleryTitleStyle,
  galleryFont,
} from "@/lib/galleryTheme";
import GalleryCoverBanner from "@/components/GalleryCoverBanner";
import { TextPositionIcon, ShapeIcon, GridStyleIcon } from "@/components/GalleryStyleIcons";
import { formatDateDMYFromInput } from "@/lib/dateInputFormat";
import { useT, useLang } from "@/i18n/client";
import { dateLocale } from "@/i18n/config";
import { CLOSE_ANIMATION_MS } from "@/components/galleryManage/constants";
import { GridStylePreview } from "@/components/galleryManage/GridStylePreview";
import type { PhotoWithUrl } from "@/components/galleryManage/types";

export function GallerySettingsModal({
  isStandalone,
  title,
  setTitle,
  shootDate,
  setShootDate,
  clientEmail,
  setClientEmail,
  clientPhone,
  setClientPhone,
  allowDownloads,
  setAllowDownloads,
  allowClientUpload,
  setAllowClientUpload,
  expiryDays,
  setExpiryDays,
  expiryOptions,
  theme,
  setTheme,
  coverTextPosition,
  setCoverTextPosition,
  coverShape,
  setCoverShape,
  coverPhotoId,
  setCoverPhotoId,
  coverFocalX,
  coverFocalY,
  onPickCoverPhoto,
  titleFontOverride,
  setTitleFontOverride,
  gridStyleOverride,
  setGridStyleOverride,
  photos,
  previewTitle,
  previewDateLabel,
  saving,
  onSave,
  onClose,
  onDeleteGallery,
  deletingGallery,
  isArchived,
  restoredOnce,
  permanentDeleteAt,
  onRestoreGallery,
  restoringGallery,
}: {
  isStandalone: boolean;
  title: string;
  setTitle: (v: string) => void;
  shootDate: string;
  setShootDate: (v: string) => void;
  clientEmail: string;
  setClientEmail: (v: string) => void;
  clientPhone: string;
  setClientPhone: (v: string) => void;
  allowDownloads: boolean;
  setAllowDownloads: (v: boolean) => void;
  allowClientUpload: boolean;
  setAllowClientUpload: (v: boolean) => void;
  expiryDays: 7 | 14 | 30 | 90 | 180 | 365 | null;
  setExpiryDays: (v: 7 | 14 | 30 | 90 | 180 | 365) => void;
  expiryOptions: { value: 7 | 14 | 30 | 90 | 180 | 365; label: string }[];
  theme: string;
  setTheme: (v: string) => void;
  coverTextPosition: string;
  setCoverTextPosition: (v: string) => void;
  coverShape: string;
  setCoverShape: (v: string) => void;
  coverPhotoId: string | null;
  setCoverPhotoId: (v: string) => void;
  coverFocalX: number;
  coverFocalY: number;
  onPickCoverPhoto: (photo: PhotoWithUrl) => void;
  titleFontOverride: string | null;
  setTitleFontOverride: (v: string | null) => void;
  gridStyleOverride: string | null;
  setGridStyleOverride: (v: string | null) => void;
  photos: PhotoWithUrl[];
  previewTitle: string;
  previewDateLabel: string | null;
  saving: boolean;
  onSave: () => void;
  onClose: () => void;
  onDeleteGallery: () => void;
  deletingGallery: boolean;
  isArchived: boolean;
  restoredOnce: boolean;
  permanentDeleteAt: string | null;
  onRestoreGallery: () => void;
  restoringGallery: boolean;
}) {
  const t = useT();
  const lang = useLang();
  const [topTab, setTopTab] = useState<"details" | "style">("details");
  const [detailsTab, setDetailsTab] = useState<"details" | "permissions">("details");
  // Two separate confirmation steps, deliberately — this is more consequential than the plain
  // single-confirm patterns elsewhere in the app (e.g. cancel-subscription), since it removes a
  // gallery from client view immediately, even though the underlying data survives 14 more days.
  const [deleteStep, setDeleteStep] = useState<"idle" | "confirm1" | "confirm2">("idle");
  const [restoreStep, setRestoreStep] = useState<"idle" | "confirm1" | "confirm2">("idle");
  const [entered, setEntered] = useState(false);
  const [closing, setClosing] = useState(false);

  useEffect(() => {
    const raf = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  const closeWithAnimation = () => {
    setClosing(true);
    setTimeout(onClose, CLOSE_ANIMATION_MS);
  };

  const resolvedGridStyle = gridStyleOverride ?? galleryThemeById(theme).gridStyle;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{
        // No backdrop-filter: blur() here on purpose — compositing a full-screen blur on top of
        // a gallery grid with many already-decoded photos behind it can make the browser take
        // seconds (or longer) to paint the very first frame, which read as "the modal doesn't
        // open" on photo-heavy galleries. A plain, more opaque tint gives the same visual
        // separation for a fraction of the GPU cost.
        background: entered && !closing ? "rgba(28, 27, 25, 0.7)" : "rgba(28, 27, 25, 0)",
        transition: `background ${CLOSE_ANIMATION_MS + 60}ms ease`,
      }}
      onClick={closeWithAnimation}
    >
      <style>{`
        @keyframes editGalleryZoomOut { from { transform: scale(1); opacity: 1; } to { transform: scale(0.85); opacity: 0; } }
        .edit-gallery-closing { animation: editGalleryZoomOut ${CLOSE_ANIMATION_MS}ms ease forwards; }
      `}</style>
      <div
        className={`${galleryFont.variable} w-full max-w-md rounded-3xl p-5 bg-paper shadow-sheet max-h-[85vh] overflow-y-auto ${closing ? "edit-gallery-closing" : ""}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold font-display">{t("הגדרות גלריה")}</h2>
          <button onClick={closeWithAnimation} className="h-8 w-8 rounded-full flex items-center justify-center bg-white border border-line">
            <IconAlbumClose className="h-4 w-4" />
          </button>
        </div>

        {/* Primary tabs — a segmented control (inset pill on a tinted track) so it reads
            unambiguously as the main navigation, distinct from the smaller sub-tabs below. */}
        <div className="flex gap-1 p-1 rounded-2xl mb-4" style={{ background: "var(--color-chip)" }}>
          <button
            onClick={() => setTopTab("details")}
            className="flex-1 rounded-xl py-2.5 text-sm font-bold"
            style={{
              background: topTab === "details" ? "var(--color-amber-deep)" : "transparent",
              color: topTab === "details" ? "#fff" : "var(--color-ink-soft)",
            }}
          >
            {t("פרטי הגלריה")}
          </button>
          <button
            onClick={() => setTopTab("style")}
            className="flex-1 rounded-xl py-2.5 text-sm font-bold"
            style={{
              background: topTab === "style" ? "var(--color-amber-deep)" : "transparent",
              color: topTab === "style" ? "#fff" : "var(--color-ink-soft)",
            }}
          >
            {t("עיצוב הגלריה")}
          </button>
        </div>

        {topTab === "details" ? (
          <>
            <div className="flex gap-1.5 mb-4">
              <button
                onClick={() => setDetailsTab("details")}
                className="flex-1 rounded-full py-2 text-xs font-semibold"
                style={{
                  background: detailsTab === "details" ? "var(--color-ink)" : "var(--color-chip)",
                  color: detailsTab === "details" ? "var(--color-paper)" : "var(--color-ink-soft)",
                }}
              >
                {t("פרטים")}
              </button>
              <button
                onClick={() => setDetailsTab("permissions")}
                className="flex-1 rounded-full py-2 text-xs font-semibold"
                style={{
                  background: detailsTab === "permissions" ? "var(--color-ink)" : "var(--color-chip)",
                  color: detailsTab === "permissions" ? "var(--color-paper)" : "var(--color-ink-soft)",
                }}
              >
                {t("הרשאות ושמירה")}
              </button>
            </div>

            {detailsTab === "details" ? (
              <div className="space-y-3.5">
                <div>
                  <label className="text-xs block mb-1 text-ink-soft">{t("שם הגלריה")}</label>
                  <input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="w-full rounded-lg px-3 py-2 text-sm border border-line bg-white"
                  />
                  <p className="text-[11px] text-ink-soft mt-1">
                    {t("השאירו ריק כדי שהשם יעודכן אוטומטית משם הלקוח/ה בעמוד האירוע, הקלדת שם כאן קובעת אותו סופית, גם אם שם האירוע ישתנה בהמשך.")}
                  </p>
                </div>

                <div className="flex gap-2">
                  {/* min-w-0 (not a real px min-width) keeps each field to exactly its flex-1
                      share of the row, so the two together always sum to the same width as the
                      "שם הגלריה" field above. A native date input's own inline value renders
                      wider than its declared 100% width once dir="ltr" applies inside this RTL
                      page (confirmed on a real iPhone — see the identical fix in
                      NewEventModal.tsx/EditEventModal.tsx) — the real <input> here is fully
                      invisible (opacity-0) and just an interactive hit-target; the visible
                      border/background/text is a plain div with overflow-hidden, so that
                      overflow gets clipped instead of pushing this field wider than its sibling. */}
                  {isStandalone && (
                    <div className="flex-1 min-w-0">
                      <label className="text-xs block mb-1 text-ink-soft">{t("תאריך הצילום")}</label>
                      <div className="relative w-full rounded-lg border border-line bg-white overflow-hidden">
                        <div className="pointer-events-none flex items-center justify-center px-3 py-2 text-sm" dir="ltr">
                          {shootDate ? formatDateDMYFromInput(shootDate) : <span className="text-ink-soft">{t("בחר תאריך")}</span>}
                        </div>
                        <input
                          type="date"
                          value={shootDate}
                          onChange={(e) => setShootDate(e.target.value)}
                          onClick={(e) => {
                            // Wrapped in try/catch — a confirmed WebKit bug (showPicker() doesn't
                            // work on iOS, webkit.org bug 261703) makes this throw on some iOS
                            // Safari versions. Harmless no-op on affected devices; the input's own
                            // native default tap-to-open doesn't depend on this call.
                            try {
                              (e.currentTarget as HTMLInputElement & { showPicker?: () => void }).showPicker?.();
                            } catch {}
                          }}
                          dir="ltr"
                          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                        />
                      </div>
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <label className="text-xs block mb-1 text-ink-soft">{t("משך שמירת הגלריה")}</label>
                    <select
                      value={expiryDays ?? expiryOptions[expiryOptions.length - 1].value}
                      onChange={(e) => setExpiryDays(Number(e.target.value) as 7 | 14 | 30 | 90 | 180 | 365)}
                      className="w-full rounded-lg px-2 py-2 text-sm border border-line bg-white"
                    >
                      {expiryOptions.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {t(opt.label)}
                        </option>
                      ))}
                    </select>
                    {expiryDays === null && (
                      <p className="text-[11px] mt-1 text-ink-soft">
                        {t("כרגע ללא הגבלת זמן (מדיניות ישנה), בחירת טווח כאן תחיל עליה את המדיניות החדשה")}
                      </p>
                    )}
                  </div>
                </div>

                <div>
                  <label className="text-xs block mb-1 text-ink-soft">{t("אימייל הלקוח/ה (לא חובה, לתזכורת שבוע לפני שהגלריה נמחקת)")}</label>
                  <input
                    type="email"
                    value={clientEmail}
                    onChange={(e) => setClientEmail(e.target.value)}
                    placeholder="example@gmail.com"
                    className="w-full rounded-lg px-3 py-2 text-sm border border-line bg-white"
                  />
                </div>

                <div>
                  <label className="text-xs block mb-1 text-ink-soft">{t("טלפון הלקוח/ה (לא חובה, לתזכורת שבוע לפני שהגלריה נמחקת בוואטסאפ)")}</label>
                  <input
                    type="tel"
                    value={clientPhone}
                    onChange={(e) => setClientPhone(e.target.value)}
                    placeholder="050-1234567"
                    className="w-full rounded-lg px-3 py-2 text-sm border border-line bg-white font-data"
                  />
                </div>
              </div>
            ) : (
              <div className="space-y-3.5">
                <div className="flex items-center justify-between gap-3 rounded-xl px-3.5 py-3 bg-chip">
                  <div>
                    <div className="text-sm font-semibold">{t("אפשרות הורדת קבצים מקוריים")}</div>
                    <div className="text-xs text-ink-soft mt-0.5">{t("כשמכובה, הלקוח/ה יוכלו רק לצפות בתמונות, לא להוריד")}</div>
                  </div>
                  <button
                    onClick={() => setAllowDownloads(!allowDownloads)}
                    role="switch"
                    aria-checked={allowDownloads}
                    className="relative h-6 w-11 shrink-0 rounded-full flex items-center px-0.5"
                    style={{
                      background: allowDownloads ? "var(--color-amber-deep)" : "var(--color-line)",
                      justifyContent: allowDownloads ? "flex-start" : "flex-end",
                    }}
                  >
                    <span className="h-5 w-5 rounded-full shadow" style={{ background: "#fff" }} />
                  </button>
                </div>
                <div className="flex items-center justify-between gap-3 rounded-xl px-3.5 py-3 bg-chip">
                  <div>
                    <div className="text-sm font-semibold">{t("אפשרות העלאת תמונות ע\"י הלקוח/ה")}</div>
                    <div className="text-xs text-ink-soft mt-0.5">{t("כשמופעל, הלקוח/ה יוכלו להעלות תמונות משלהם ישירות לגלריה")}</div>
                  </div>
                  <button
                    onClick={() => setAllowClientUpload(!allowClientUpload)}
                    role="switch"
                    aria-checked={allowClientUpload}
                    className="relative h-6 w-11 shrink-0 rounded-full flex items-center px-0.5"
                    style={{
                      background: allowClientUpload ? "var(--color-amber-deep)" : "var(--color-line)",
                      justifyContent: allowClientUpload ? "flex-start" : "flex-end",
                    }}
                  >
                    <span className="h-5 w-5 rounded-full shadow" style={{ background: "#fff" }} />
                  </button>
                </div>
              </div>
            )}
          </>
        ) : (
          <>
            {/* Live preview — the exact same components the real public gallery page renders,
                including a sample of the actual photo grid, so a layout change is visible right
                here instead of only after leaving the modal to check the real gallery. */}
            <div
              className="rounded-2xl overflow-hidden mb-5 border p-3.5"
              style={{
                background: galleryThemeById(theme).bg,
                borderColor: "var(--color-line)",
                ...galleryThemeVars(theme, { titleFontOverride, gridStyleOverride }),
              }}
            >
              <GalleryCoverBanner
                photoUrl={(() => {
                  const cover = photos.find((p) => p.id === coverPhotoId) ?? photos[0];
                  return cover ? resizedPhotoUrl(cover, 2048) : null;
                })()}
                title={previewTitle}
                dateLabel={previewDateLabel}
                theme={theme}
                textPosition={coverTextPosition}
                shape={coverShape}
                titleFontOverride={titleFontOverride}
                focalX={coverFocalX}
                focalY={coverFocalY}
              />
              {photos.length > 0 && (
                <div className="mt-3">
                  <GridStylePreview photos={photos} gridStyle={resolvedGridStyle} />
                </div>
              )}
            </div>

            {photos.length > 0 && (
              <>
                <p className="text-xs text-ink-soft mb-2.5">{t("תמונת שער")}</p>
                <div className="flex gap-2 mb-5 overflow-x-auto">
                  {photos.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => onPickCoverPhoto(p)}
                      className="shrink-0 h-14 w-14 rounded-lg overflow-hidden"
                      style={{
                        boxShadow:
                          (coverPhotoId ?? photos[0]?.id) === p.id
                            ? "0 0 0 2px var(--color-paper), 0 0 0 4px var(--color-amber-deep)"
                            : "0 0 0 1px var(--color-line)",
                      }}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={resizedPhotoUrl(p, 256)} alt="" loading="lazy" decoding="async" className="w-full h-full object-cover" />
                    </button>
                  ))}
                </div>
              </>
            )}

            {/* Text position and shape apply to every theme, the premium one included (its own
                full-screen reading of them, see GalleryPremiumCover). */}
            {(
            <>
            <p className="text-xs text-ink-soft mb-2.5">{t("מיקום הכיתוב")}</p>
            <div className="grid grid-cols-4 gap-2 mb-5">
              {COVER_TEXT_POSITIONS.map((p) => {
                const active = coverTextPosition === p.id;
                return (
                  <button
                    key={p.id}
                    onClick={() => setCoverTextPosition(p.id)}
                    title={t(p.label)}
                    aria-label={t(p.label)}
                    className={`aspect-square rounded-2xl flex items-center justify-center border ${BTN_PRESS}`}
                    style={{
                      borderColor: active ? "var(--color-amber-deep)" : "var(--color-line)",
                      borderWidth: active ? "2px" : "1px",
                      background: active ? "var(--color-amber-bg)" : "var(--color-card)",
                      color: active ? "var(--color-amber-deep)" : "var(--color-ink-soft)",
                    }}
                  >
                    <TextPositionIcon position={p.id} />
                  </button>
                );
              })}
            </div>

            <p className="text-xs text-ink-soft mb-2.5">{t("צורת התמונה")}</p>
            <div className="grid grid-cols-4 gap-2 mb-5">
              {COVER_SHAPES.map((s) => {
                const active = coverShape === s.id;
                return (
                  <button
                    key={s.id}
                    onClick={() => setCoverShape(s.id)}
                    title={t(s.label)}
                    aria-label={t(s.label)}
                    className={`aspect-square rounded-2xl flex items-center justify-center border ${BTN_PRESS}`}
                    style={{
                      borderColor: active ? "var(--color-amber-deep)" : "var(--color-line)",
                      borderWidth: active ? "2px" : "1px",
                      background: active ? "var(--color-amber-bg)" : "var(--color-card)",
                      color: active ? "var(--color-amber-deep)" : "var(--color-ink-soft)",
                    }}
                  >
                    <ShapeIcon shape={s.id} />
                  </button>
                );
              })}
            </div>
            </>
            )}

            <p className="text-xs text-ink-soft mb-2.5">{t("ערכת נושא")}</p>
            <div className="grid grid-cols-6 gap-1.5 mb-5">
              {GALLERY_THEMES.map((th) => {
                const active = theme === th.id;
                return (
                  <button
                    key={th.id}
                    onClick={() => {
                      setTheme(th.id);
                      setTitleFontOverride(null);
                      setGridStyleOverride(null);
                    }}
                    className={`flex flex-col items-center gap-1.5 ${BTN_PRESS}`}
                  >
                    <span
                      className="relative h-12 w-12 rounded-2xl overflow-hidden grid grid-cols-2"
                      style={{
                        background: th.bg,
                        boxShadow: active
                          ? "0 0 0 2px var(--color-paper), 0 0 0 4px var(--color-amber-deep)"
                          : "0 0 0 1px var(--color-line)",
                      }}
                    >
                      <span style={{ background: th.surface }} />
                      <span style={{ background: th.accent }} />
                      {active && (
                        <span
                          className="absolute -top-1 -right-1 h-4 w-4 rounded-full flex items-center justify-center text-[9px]"
                          style={{ background: "var(--color-amber-deep)", color: "var(--color-on-accent)" }}
                        >
                          ✓
                        </span>
                      )}
                    </span>
                    <span
                      className="text-[11px] font-semibold text-center leading-tight"
                      style={{ ...galleryTitleStyle(th.id), color: active ? "var(--color-amber-deep)" : "var(--color-ink)" }}
                    >
                      {t(th.label)}
                    </span>
                  </button>
                );
              })}
            </div>

            <p className="text-xs text-ink-soft mb-2.5">{t("סוג פונט")}</p>
            <div className="grid grid-cols-2 gap-2 mb-5">
              {FONT_OPTIONS.map((f) => {
                const active = (titleFontOverride ?? galleryThemeById(theme).titleFont) === f.id;
                return (
                  <button
                    key={f.id}
                    onClick={() => setTitleFontOverride(f.id)}
                    className={`rounded-xl px-3 py-2.5 text-sm font-semibold border ${BTN_PRESS}`}
                    style={{
                      borderColor: active ? "var(--color-amber-deep)" : "var(--color-line)",
                      borderWidth: active ? "2px" : "1px",
                      background: active ? "var(--color-amber-bg)" : "var(--color-card)",
                      color: active ? "var(--color-amber-deep)" : "var(--color-ink)",
                      fontFamily: f.id === "serif" ? "var(--font-gallery-serif)" : "var(--font-sans)",
                    }}
                  >
                    {t(f.label)}
                  </button>
                );
              })}
            </div>

            <p className="text-xs text-ink-soft mb-2.5">{t("פריסת תמונות")}</p>
            <div className="grid grid-cols-4 gap-2 mb-5">
              {GRID_STYLE_OPTIONS.map((g) => {
                const active = resolvedGridStyle === g.id;
                return (
                  <button
                    key={g.id}
                    onClick={() => setGridStyleOverride(g.id)}
                    title={t(g.label)}
                    aria-label={t(g.label)}
                    className={`aspect-square rounded-2xl flex items-center justify-center border ${BTN_PRESS}`}
                    style={{
                      borderColor: active ? "var(--color-amber-deep)" : "var(--color-line)",
                      borderWidth: active ? "2px" : "1px",
                      background: active ? "var(--color-amber-bg)" : "var(--color-card)",
                      color: active ? "var(--color-amber-deep)" : "var(--color-ink-soft)",
                    }}
                  >
                    <GridStyleIcon style={g.id} />
                  </button>
                );
              })}
            </div>
          </>
        )}

        <button
          onClick={onSave}
          disabled={saving}
          className="w-full rounded-lg py-3 text-sm font-semibold bg-ink text-white disabled:opacity-60 mt-5"
        >
          {saving ? t("שומר...") : t("שמירת שינויים")}
        </button>

        <div className="mt-6 pt-5 border-t border-line">
          {isArchived ? (
            restoredOnce ? (
              <p className="text-xs text-center text-ink-soft">
                {t("הגלריה כבר נוצלה לשחזור חד-פעמי ולא ניתן לשחזר אותה שוב.")}
                {permanentDeleteAt && ` ${t("תימחק סופית ב-{date}.", { date: new Date(permanentDeleteAt).toLocaleDateString(dateLocale(lang)) })}`}
              </p>
            ) : (
              <>
                {restoreStep === "idle" && (
                  <button
                    onClick={() => setRestoreStep("confirm1")}
                    className="w-full rounded-lg py-2.5 text-sm font-semibold text-sage"
                  >
                    {t("שחזור גלריה")}
                  </button>
                )}
                {restoreStep === "confirm1" && (
                  <div className="rounded-xl p-3.5 space-y-2.5" style={{ background: "var(--color-chip)" }}>
                    <p className="text-xs text-ink">{t("לשחזר את הגלריה? היא תחזור להיות פעילה עם תוקף לחודש.")}</p>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setRestoreStep("idle")}
                        className="flex-1 rounded-lg py-2 text-xs font-semibold bg-white border border-line text-ink-soft"
                      >
                        {t("ביטול")}
                      </button>
                      <button
                        onClick={() => setRestoreStep("confirm2")}
                        className="flex-1 rounded-lg py-2 text-xs font-semibold bg-sage text-white"
                      >
                        {t("כן, המשך")}
                      </button>
                    </div>
                  </div>
                )}
                {restoreStep === "confirm2" && (
                  <div className="rounded-xl p-3.5 space-y-2.5" style={{ background: "var(--color-chip)" }}>
                    <p className="text-xs font-semibold text-sage">{t("אישור אחרון")}</p>
                    <p className="text-xs text-ink">
                      {t("זהו שחזור חד-פעמי. לא ניתן יהיה לשחזר את הגלריה שוב בעתיד. בפעם הבאה שתפוג או תימחק, היא תימחק סופית תוך 3 ימים בלבד.")}
                    </p>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setRestoreStep("idle")}
                        disabled={restoringGallery}
                        className="flex-1 rounded-lg py-2 text-xs font-semibold bg-white border border-line text-ink-soft disabled:opacity-60"
                      >
                        {t("ביטול")}
                      </button>
                      <button
                        onClick={onRestoreGallery}
                        disabled={restoringGallery}
                        className="flex-1 rounded-lg py-2 text-xs font-semibold bg-sage text-white disabled:opacity-60"
                      >
                        {restoringGallery ? t("משחזר...") : t("כן, לשחזר")}
                      </button>
                    </div>
                  </div>
                )}
              </>
            )
          ) : (
            <>
              {deleteStep === "idle" && (
                <button
                  onClick={() => setDeleteStep("confirm1")}
                  className="w-full rounded-lg py-2.5 text-sm font-semibold text-rose"
                >
                  {t("מחיקת הגלריה")}
                </button>
              )}
              {deleteStep === "confirm1" && (
                <div className="rounded-xl p-3.5 space-y-2.5" style={{ background: "var(--color-chip)" }}>
                  <p className="text-xs text-ink">
                    {t("בטוח שברצונך למחוק את הגלריה? הלקוח יאבד גישה לקישור מיד.")}
                  </p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setDeleteStep("idle")}
                      className="flex-1 rounded-lg py-2 text-xs font-semibold bg-white border border-line text-ink-soft"
                    >
                      {t("ביטול")}
                    </button>
                    <button
                      onClick={() => setDeleteStep("confirm2")}
                      className="flex-1 rounded-lg py-2 text-xs font-semibold bg-rose text-white"
                    >
                      {t("כן, המשך")}
                    </button>
                  </div>
                </div>
              )}
              {deleteStep === "confirm2" && (
                <div className="rounded-xl p-3.5 space-y-2.5" style={{ background: "var(--color-chip)" }}>
                  <p className="text-xs font-semibold text-rose">{t("אישור אחרון")}</p>
                  <p className="text-xs text-ink">
                    {t("הגלריה תישמר בארכיון {n} ימים ואז תימחק סופית לצמיתות, כולל כל התמונות. לא ניתן לבטל לאחר המחיקה הסופית.", { n: restoredOnce ? 3 : 14 })}
                  </p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setDeleteStep("idle")}
                      disabled={deletingGallery}
                      className="flex-1 rounded-lg py-2 text-xs font-semibold bg-white border border-line text-ink-soft disabled:opacity-60"
                    >
                      {t("ביטול")}
                    </button>
                    <button
                      onClick={onDeleteGallery}
                      disabled={deletingGallery}
                      className="flex-1 rounded-lg py-2 text-xs font-semibold bg-rose text-white disabled:opacity-60"
                    >
                      {deletingGallery ? t("מוחק...") : t("כן, למחוק את הגלריה")}
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
